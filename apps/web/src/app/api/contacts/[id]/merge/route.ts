import { defineRoute, errorResponse, ok } from '@/lib/api/route';
import { contactMergeRequestSchema } from '@ksp/shared';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

/**
 * POST /api/contacts/[id]/merge
 *
 * 重複候補レビュー画面からのマージ確定。
 *
 * resolution:
 *   - 'merged':
 *       masterContactId が master (残す側)、URL の [id] (= newContactId) が slave。
 *       slave を review_status='merged', deleted_at=now() に更新。
 *       meeting_attendees.contact_id / meetings.contact_id を slave→master に張り替え。
 *       contact_duplicates に resolution='merged', resolved_by を記録。
 *   - 'kept_separate':
 *       両 contact を review_status='verified' に更新。
 *       contact_duplicates に resolution='kept_separate' を記録。
 *
 * 認可:
 *   - 自分が両 contact の owner_user_id か、manager/admin のみ。RLS でも二重に防御。
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const idParamSchema = z.object({ id: z.string().uuid() });

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface ContactOwnerRow {
  id: string;
  owner_user_id: string;
  review_status: string | null;
}

export async function POST(req: NextRequest, ctx: RouteParams): Promise<Response> {
  const resolved = await ctx.params;
  const idParse = idParamSchema.safeParse(resolved);
  if (!idParse.success) {
    return errorResponse(400, 'invalid_id', 'contact id must be uuid');
  }
  const newContactId = idParse.data.id;

  const handler = defineRoute(
    { body: contactMergeRequestSchema },
    async ({ user, supabase, body }) => {
      const isPrivileged = user.role === 'manager' || user.role === 'admin';
      const nowIso = new Date().toISOString();

      if (body.resolution === 'merged') {
        if (!body.masterContactId) {
          return errorResponse(
            400,
            'master_contact_required',
            'masterContactId is required for merged resolution',
          );
        }
        if (body.masterContactId === newContactId) {
          return errorResponse(
            400,
            'master_equals_slave',
            'masterContactId must differ from path id',
          );
        }

        // 両者の owner / 存在を確認。
        const { data: pair, error: pairError } = await supabase
          .from('contacts')
          .select('id,owner_user_id,review_status')
          .in('id', [newContactId, body.masterContactId])
          .is('deleted_at', null);
        if (pairError) {
          return errorResponse(500, 'contact_lookup_failed', pairError.message);
        }
        const rows = (pair ?? []) as ContactOwnerRow[];
        if (rows.length !== 2) {
          return errorResponse(404, 'contact_not_found', 'one or both contacts missing');
        }
        const ownerIds = new Set(rows.map((r) => r.owner_user_id));
        if (!isPrivileged && !ownerIds.has(user.id)) {
          return errorResponse(403, 'forbidden', 'not contact owner');
        }

        // 1) meeting_attendees の付け替え。
        const { error: attErr } = await supabase
          .from('meeting_attendees')
          .update({ contact_id: body.masterContactId })
          .eq('contact_id', newContactId);
        if (attErr) {
          return errorResponse(500, 'attendee_relink_failed', attErr.message);
        }

        // 2) meetings.contact_id の付け替え。
        const { error: meetingErr } = await supabase
          .from('meetings')
          .update({ contact_id: body.masterContactId })
          .eq('contact_id', newContactId);
        if (meetingErr) {
          return errorResponse(500, 'meeting_relink_failed', meetingErr.message);
        }

        // 3) slave を merged + soft delete。
        const { error: slaveErr } = await supabase
          .from('contacts')
          .update({
            review_status: 'merged',
            deleted_at: nowIso,
            updated_at: nowIso,
          })
          .eq('id', newContactId);
        if (slaveErr) {
          return errorResponse(500, 'slave_update_failed', slaveErr.message);
        }

        // 4) master は verified に進める (まだ pending_review の可能性)。
        const { error: masterErr } = await supabase
          .from('contacts')
          .update({ review_status: 'verified', updated_at: nowIso })
          .eq('id', body.masterContactId);
        if (masterErr) {
          return errorResponse(500, 'master_update_failed', masterErr.message);
        }

        // 5) contact_duplicates に履歴。同 pair の pending 行を更新、無ければ INSERT。
        await recordDuplicateResolution(supabase, {
          newContactId,
          existingContactId: body.masterContactId,
          resolution: 'merged',
          resolvedBy: user.id,
        });

        return ok({
          masterContactId: body.masterContactId,
          slaveContactId: newContactId,
          resolution: 'merged' as const,
        });
      }

      // kept_separate
      const { data: pair, error: pairError } = await supabase
        .from('contacts')
        .select('id,owner_user_id,review_status')
        .eq('id', newContactId)
        .is('deleted_at', null)
        .maybeSingle();
      if (pairError) {
        return errorResponse(500, 'contact_lookup_failed', pairError.message);
      }
      const row = pair as ContactOwnerRow | null;
      if (!row) {
        return errorResponse(404, 'contact_not_found');
      }
      if (!isPrivileged && row.owner_user_id !== user.id) {
        return errorResponse(403, 'forbidden', 'not contact owner');
      }

      const { error: updErr } = await supabase
        .from('contacts')
        .update({ review_status: 'verified', updated_at: nowIso })
        .eq('id', newContactId);
      if (updErr) {
        return errorResponse(500, 'contact_update_failed', updErr.message);
      }

      // masterContactId 指定があればそちらも verified に。
      if (body.masterContactId && body.masterContactId !== newContactId) {
        await supabase
          .from('contacts')
          .update({ review_status: 'verified', updated_at: nowIso })
          .eq('id', body.masterContactId);
        await recordDuplicateResolution(supabase, {
          newContactId,
          existingContactId: body.masterContactId,
          resolution: 'kept_separate',
          resolvedBy: user.id,
        });
      }

      return ok({
        contactId: newContactId,
        resolution: 'kept_separate' as const,
      });
    },
  );

  return handler(req);
}

interface DuplicateResolveInput {
  newContactId: string;
  existingContactId: string;
  resolution: 'merged' | 'kept_separate';
  resolvedBy: string;
}

async function recordDuplicateResolution(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createServerClient>>,
  input: DuplicateResolveInput,
): Promise<void> {
  // 既存 pending 行があれば UPDATE、無ければ INSERT。
  try {
    const { data: existing } = await supabase
      .from('contact_duplicates')
      .select('id')
      .eq('new_contact_id', input.newContactId)
      .eq('existing_contact_id', input.existingContactId)
      .limit(1)
      .maybeSingle();
    const existingRow = existing as { id: string } | null;
    if (existingRow?.id) {
      await supabase
        .from('contact_duplicates')
        .update({
          resolution: input.resolution,
          resolved_by: input.resolvedBy,
        })
        .eq('id', existingRow.id);
      return;
    }
    await supabase.from('contact_duplicates').insert({
      new_contact_id: input.newContactId,
      existing_contact_id: input.existingContactId,
      // 100% 確定でマージ/分離した記録なので score=1.0、fields は手動。
      match_score: 1,
      match_fields: ['manual'],
      resolution: input.resolution,
      resolved_by: input.resolvedBy,
    });
  } catch {
    // 履歴記録失敗は本処理を巻き戻さない (best-effort)。
  }
}
