import { requireUser } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { NewMeetingForm, type NewMeetingFormContact } from './_components/new-meeting-form';

export const metadata = { title: '新規商談' };

// 商談の contact picker / 候補一覧は最新が要るので動的レンダ。
export const dynamic = 'force-dynamic';

/**
 * 新規商談作成 (SC-10 / P0-M-02 fix)。
 *
 * 設計書 SC-10 では `ContactPicker, AttendeesPicker, EmailTemplatePicker, AvailabilityPreview`
 * を持つ予定だが、本 PR では「最低限 contact_id + title だけでも作れる簡易フォーム」を先行実装。
 * AttendeesPicker / EmailTemplatePicker / AvailabilityPreview は P2 で接続予定。
 *
 * フロー:
 *   1. requireUser() で auth + role check
 *   2. query から contact_id を読む (名刺詳細から遷移した場合の prefill)
 *   3. server で contacts (新しい順 50 件) を SELECT → client form に渡して combobox
 *   4. client form が POST /api/meetings → 成功で /meetings/[id] へ redirect
 */
export default async function NewMeetingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser();
  const sp = await searchParams;

  const rawContactId = (() => {
    const v = sp.contact_id ?? sp.contactId;
    if (Array.isArray(v)) return v[0] ?? '';
    return v ?? '';
  })();
  // 緩い uuid 検証 (form 側で再検証)
  const initialContactId = /^[0-9a-f-]{32,40}$/i.test(rawContactId) ? rawContactId : '';

  const contacts = await loadContacts(initialContactId);

  return (
    <div className="space-y-10 max-w-3xl mx-auto">
      <div className="flex items-baseline justify-between border-t-2 border-foreground pt-3 animate-fade-in">
        <p className="kicker">№ 01 — 営業 / 商談 新規作成</p>
        <Link
          href="/meetings"
          className="kicker tabular hover:text-foreground/80 transition-colors"
        >
          商談一覧へ戻る
        </Link>
      </div>

      <header className="space-y-3 animate-fade-up">
        <h1 className="display text-3xl md:text-[2.5rem] font-semibold tracking-crisp text-balance">
          新しい商談を、いま始める。
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground max-w-prose">
          相手の名刺と件名、日時を入れるだけで OK。後から録画・参加者・メモを足していきます。
          細かい設定は商談詳細ページから編集できます。
        </p>
      </header>

      <div className="hairline" aria-hidden />

      <NewMeetingForm contacts={contacts} initialContactId={initialContactId} />
    </div>
  );
}

async function loadContacts(prioritizeId: string): Promise<NewMeetingFormContact[]> {
  try {
    const supabase = await createServerClient();
    const { data: contactsRows } = await supabase
      .from('contacts')
      .select('id,name,title,company_id')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(50);
    const rows = (contactsRows ?? []) as Array<{
      id: string;
      name: string | null;
      title: string | null;
      company_id: string | null;
    }>;

    // prefill 対象の contact が limit 外なら明示的に追加 fetch
    if (prioritizeId && !rows.some((r) => r.id === prioritizeId)) {
      const { data: extra } = await supabase
        .from('contacts')
        .select('id,name,title,company_id')
        .eq('id', prioritizeId)
        .maybeSingle();
      if (extra) {
        rows.unshift(
          extra as { id: string; name: string | null; title: string | null; company_id: string | null },
        );
      }
    }

    const companyIds = [
      ...new Set(rows.map((r) => r.company_id).filter((v): v is string => Boolean(v))),
    ];
    const companies = companyIds.length
      ? (((await supabase.from('companies').select('id,name').in('id', companyIds)).data ??
          []) as Array<{ id: string; name: string | null }>)
      : [];
    const companyNameById = new Map(companies.map((co) => [co.id, co.name ?? null]));

    return rows.map((r) => ({
      id: r.id,
      name: r.name ?? '名前未設定',
      title: r.title ?? null,
      companyName: r.company_id ? (companyNameById.get(r.company_id) ?? null) : null,
    }));
  } catch {
    return [];
  }
}
