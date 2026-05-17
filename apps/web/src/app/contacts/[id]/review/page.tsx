import { requireUser } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { type DuplicateCandidate, duplicateListResponseSchema } from '@ksp/shared';
import { notFound } from 'next/navigation';
import { DuplicatePanel } from './_components/duplicate-panel';
import { ImagePane } from './_components/image-pane';
import { type FieldConfidence, ReviewForm } from './_components/review-form';

/**
 * 名刺レビュー — Server Component。
 *
 *   1. requireUser() で auth + org gate
 *   2. contacts SELECT (companies join で会社名取得)
 *   3. 業務用画像 URL を signed URL 化 (business_card_image_url が storage key/path 想定)
 *   4. 重複候補は contact_duplicates から取得 (新規側 = this contact)
 *   5. すべて degrade 可能 (列 / 行 / 関連テーブル不在でも UI は描画)
 */

export const metadata = { title: '名刺の確認' };

// uuid であることを最低限ガード (Postgres uuid 列に non-uuid を投げると 22P02 で爆発する)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ContactRow {
  id: string;
  name: string | null;
  name_kana: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  company_id: string | null;
  business_card_image_url: string | null;
  business_card_image_hash: string | null;
  ocr_confidence: number | string | null;
  ocr_raw_json: Record<string, unknown> | null;
  review_status: string | null;
  linkedin_url: string | null;
  tags: string[] | null;
  captured_at: string | null;
  created_at: string | null;
  created_by_user_id: string | null;
}

export default async function ContactReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // 不正 UUID は即 notFound (DB 例外を吐かせない)
  if (!UUID_RE.test(id)) {
    notFound();
  }

  await requireUser();
  const supabase = await createServerClient();

  // ---------------------------------------------------------------------------
  // 1) contact 本体。RLS で org_id / deleted_at は自動フィルタ。
  // ---------------------------------------------------------------------------
  let contact: ContactRow | null = null;
  try {
    const { data, error } = await supabase
      .from('contacts')
      .select(
        [
          'id',
          'name',
          'name_kana',
          'title',
          'email',
          'phone',
          'company_id',
          'business_card_image_url',
          'business_card_image_hash',
          'ocr_confidence',
          'ocr_raw_json',
          'review_status',
          'linkedin_url',
          'tags',
          'captured_at',
          'created_at',
          'created_by_user_id',
        ].join(','),
      )
      .eq('id', id)
      .maybeSingle<ContactRow>();

    if (!error && data) contact = data;
    // RLS で hit しない場合は data=null・error=null。下で notFound へ。
  } catch {
    // contacts テーブル未生成 or 列不在: degrade。
  }

  if (!contact) {
    notFound();
  }

  // ---------------------------------------------------------------------------
  // 2) company name (best-effort)
  // ---------------------------------------------------------------------------
  let companyName = '';
  if (contact.company_id) {
    try {
      const { data } = await supabase
        .from('companies')
        .select('name')
        .eq('id', contact.company_id)
        .maybeSingle<{ name: string | null }>();
      companyName = data?.name ?? '';
    } catch {
      /* degrade */
    }
  }

  // ---------------------------------------------------------------------------
  // 3) business card image — signed URL (Storage)。
  //    business_card_image_url 列にはアップロード時の storage key (path) が入っている前提。
  //    外部 https URL の場合はそのまま使う。
  // ---------------------------------------------------------------------------
  const imageUrl = await resolveImageUrl(supabase, contact.business_card_image_url);

  // ---------------------------------------------------------------------------
  // 4) アップロード者名 (best-effort)
  // ---------------------------------------------------------------------------
  let uploaderName: string | null = null;
  if (contact.created_by_user_id) {
    try {
      const { data } = await supabase
        .from('users')
        .select('name')
        .eq('id', contact.created_by_user_id)
        .maybeSingle<{ name: string | null }>();
      uploaderName = data?.name ?? null;
    } catch {
      /* degrade */
    }
  }

  // ---------------------------------------------------------------------------
  // 5) 重複候補 (contact_duplicates → contacts JOIN)
  // ---------------------------------------------------------------------------
  const candidates = await fetchDuplicates(supabase, id);

  // ---------------------------------------------------------------------------
  // 6) OCR raw → fieldConfidence
  // ---------------------------------------------------------------------------
  const fieldConfidence = extractFieldConfidence(contact.ocr_raw_json);
  const ocrProvider = extractProvider(contact.ocr_raw_json);
  const overallConfidence = parseNum(contact.ocr_confidence);

  const initial = {
    id: contact.id,
    name: contact.name ?? '',
    nameKana: contact.name_kana ?? '',
    title: contact.title ?? '',
    companyName,
    email: contact.email ?? '',
    phone: contact.phone ?? '',
    linkedinUrl: contact.linkedin_url ?? '',
    tags: Array.isArray(contact.tags) ? contact.tags : [],
    reviewStatus: contact.review_status ?? 'pending_review',
  };

  return (
    <div className="space-y-10 max-w-6xl mx-auto">
      <div className="flex items-baseline justify-between border-t-2 border-foreground pt-3 animate-fade-in">
        <p className="kicker">№ 01 — 営業 / 名刺の確認</p>
        <span className="kicker tabular">状態: {labelForReviewStatus(initial.reviewStatus)}</span>
      </div>

      <header className="space-y-2 max-w-2xl animate-fade-up">
        <h1 className="display text-3xl md:text-[2.5rem] font-semibold tracking-crisp text-balance">
          読み取った内容を、確認する。
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground">
          OCR が自動で入れた項目を、画像と見比べて確認してください。
          自信のないフィールドには黄色い枠とチップを付けています。
        </p>
      </header>

      <div className="hairline" aria-hidden />

      <section
        aria-label="名刺の内容"
        className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] animate-fade-up [animation-delay:60ms]"
      >
        <div>
          <ImagePane
            imageUrl={imageUrl}
            capturedAt={contact.captured_at ?? contact.created_at}
            uploaderName={uploaderName}
            ocrProvider={ocrProvider}
            ocrConfidence={overallConfidence}
          />
        </div>
        <div>
          <ReviewForm
            initial={initial}
            fieldConfidence={fieldConfidence}
            hasDuplicates={candidates.length > 0}
          />
        </div>
      </section>

      {candidates.length > 0 ? (
        <>
          <div className="hairline" aria-hidden />
          <DuplicatePanel
            currentContactId={initial.id}
            currentName={initial.name}
            currentCompany={initial.companyName || null}
            candidates={candidates}
          />
        </>
      ) : null}

      {/* UX Round1 Brand HIGH-B-03 fix: 落款 (inkan accent) — 詳細ページ末の編集的締め */}
      <div className="flex justify-end pt-2">
        <span
          aria-hidden
          className="inline-block size-3.5 rounded-[3px] bg-cinnabar/35"
          title="落款"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function labelForReviewStatus(s: string): string {
  switch (s) {
    case 'verified':
      return '確定';
    case 'pending_review':
      return '要確認';
    case 'duplicate_suspect':
      return '重複候補';
    case 'pending_ocr':
      return 'OCR 待ち';
    case 'merged':
      return 'マージ済み';
    default:
      return s;
  }
}

function parseNum(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function extractProvider(raw: Record<string, unknown> | null): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = (raw as { provider?: unknown }).provider;
  return typeof p === 'string' ? p : null;
}

function extractFieldConfidence(raw: Record<string, unknown> | null): FieldConfidence {
  if (!raw || typeof raw !== 'object') return {};
  const fc =
    (raw as { fieldConfidence?: unknown; field_confidence?: unknown }).fieldConfidence ??
    (raw as { field_confidence?: unknown }).field_confidence;
  if (!fc || typeof fc !== 'object') return {};
  const r = fc as Record<string, unknown>;
  const pick = (key: string): number | null => {
    const v = r[key];
    return typeof v === 'number' && v >= 0 && v <= 1 ? v : null;
  };
  return {
    name: pick('name'),
    nameKana: pick('nameKana') ?? pick('name_kana'),
    title: pick('title'),
    email: pick('email'),
    phone: pick('phone'),
    companyName: pick('companyName') ?? pick('company_name'),
  };
}

async function resolveImageUrl(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  raw: string | null,
): Promise<string | null> {
  if (!raw) return null;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  try {
    const { data } = await supabase.storage
      .from('business-cards')
      .createSignedUrl(raw.replace(/^business-cards\//, ''), 60 * 10);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

async function fetchDuplicates(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  contactId: string,
): Promise<DuplicateCandidate[]> {
  try {
    const { data, error } = await supabase
      .from('contact_duplicates')
      .select('existing_contact_id, match_score, match_fields, resolution')
      .eq('new_contact_id', contactId)
      .eq('resolution', 'pending');
    if (error || !data || data.length === 0) return [];

    const ids = data
      .map((r: { existing_contact_id: string }) => r.existing_contact_id)
      .filter(Boolean);
    if (ids.length === 0) return [];

    const { data: existing } = await supabase
      .from('contacts')
      .select('id, name, email, captured_at, company_id')
      .in('id', ids);

    const byId = new Map<
      string,
      { name: string; email: string | null; captured_at: string | null; company_id: string | null }
    >(
      (existing ?? []).map(
        (r: {
          id: string;
          name: string;
          email: string | null;
          captured_at: string | null;
          company_id: string | null;
        }) => [
          r.id,
          { name: r.name, email: r.email, captured_at: r.captured_at, company_id: r.company_id },
        ],
      ),
    );

    const companyIds = Array.from(
      new Set(
        Array.from(byId.values())
          .map((v) => v.company_id)
          .filter((x): x is string => !!x),
      ),
    );
    const companyMap = new Map<string, string>();
    if (companyIds.length > 0) {
      try {
        const { data: companies } = await supabase
          .from('companies')
          .select('id, name')
          .in('id', companyIds);
        for (const c of companies ?? []) {
          if (c && typeof (c as { id?: unknown }).id === 'string') {
            companyMap.set(
              (c as { id: string }).id,
              ((c as { name?: string }).name ?? '') as string,
            );
          }
        }
      } catch {
        /* degrade */
      }
    }

    const candidates: DuplicateCandidate[] = [];
    for (const row of data as Array<{
      existing_contact_id: string;
      match_score: number | string | null;
      match_fields: unknown;
    }>) {
      const meta = byId.get(row.existing_contact_id);
      if (!meta) continue;
      const score = parseNum(row.match_score) ?? 0;
      const fields = Array.isArray(row.match_fields)
        ? (row.match_fields as string[]).filter(
            (f): f is DuplicateCandidate['matchFields'][number] =>
              ['email', 'phone', 'name_company', 'image_hash', 'linkedin'].includes(f),
          )
        : [];
      if (fields.length === 0) continue;
      candidates.push({
        contactId: row.existing_contact_id,
        name: meta.name ?? '(名前なし)',
        companyName: meta.company_id ? (companyMap.get(meta.company_id) ?? null) : null,
        email: meta.email,
        matchScore: Math.max(0, Math.min(1, score)),
        matchFields: fields,
        capturedAt: meta.captured_at,
      });
    }

    // zod で最終バリデート (型の信頼度を上げる)
    const parsed = duplicateListResponseSchema.safeParse({
      newContactId: contactId,
      candidates,
    });
    return parsed.success ? parsed.data.candidates : candidates;
  } catch {
    return [];
  }
}
