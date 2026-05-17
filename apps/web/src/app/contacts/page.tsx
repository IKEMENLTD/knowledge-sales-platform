import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  CONTACT_STATUS_LABELS,
  DEMO_CONTACTS,
  type DemoContact,
  type DemoContactStatus,
  findMember,
  formatDateJp,
} from '@/lib/demo/fixtures';
import { cn } from '@/lib/utils';
import { AlertTriangle, ArrowUpRight, CheckCircle2, IdCard, Plus, Search } from 'lucide-react';
import Link from 'next/link';

export const metadata = { title: '名刺' };

const STATUS_ORDER: DemoContactStatus[] = ['pending_review', 'duplicate_suspect', 'verified'];

function groupByStatus(contacts: DemoContact[]) {
  const groups = new Map<DemoContactStatus, DemoContact[]>();
  for (const status of STATUS_ORDER) groups.set(status, []);
  for (const c of contacts) groups.get(c.status)?.push(c);
  return groups;
}

function sectionNo(n: number) {
  return `№ ${n.toString().padStart(2, '0')}`;
}

export default async function ContactsPage(props: {
  searchParams?: Promise<{ q?: string }>;
}) {
  const sp = (await props.searchParams) ?? {};
  const q = (sp.q ?? '').trim();

  const filtered = q
    ? DEMO_CONTACTS.filter((c) => {
        const hay = `${c.fullName} ${c.furigana} ${c.companyName} ${c.title}`.toLowerCase();
        return hay.includes(q.toLowerCase());
      })
    : DEMO_CONTACTS;

  const total = filtered.length;
  const groups = groupByStatus(filtered);
  const needsReview =
    (groups.get('pending_review')?.length ?? 0) + (groups.get('duplicate_suspect')?.length ?? 0);

  // 空グループをスキップしながら通し採番。トップ kicker は № 01 / 検索 box が № 02 扱い相当だが
  // セクションのみ採番する (検索は header 内)。最初のセクション = № 02 から開始。
  let runningNo = 1; // 01 は header

  return (
    <div className="space-y-10 max-w-6xl mx-auto">
      <div className="flex items-baseline justify-between border-t-2 border-foreground pt-3 animate-fade-in">
        <p className="kicker">{sectionNo(1)} — 名刺</p>
        <span className="kicker tabular">
          {q ? `「${q}」で ${total} 件` : `${total} 件`} ・ 要確認 {needsReview} 件
        </span>
      </div>

      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between animate-fade-up">
        <div className="space-y-2 max-w-2xl">
          <h1 className="display text-3xl md:text-[2.5rem] font-semibold tracking-crisp text-balance">
            名刺 — 取り込み・確認・統合
          </h1>
          <p className="text-base leading-relaxed text-muted-foreground">
            {needsReview > 0
              ? `あと ${needsReview} 件、内容の確認が残っています。OCR の読み取りに自信のないものは「要確認」、同姓同名や同会社の被りは「重複候補」に分けています。`
              : '要確認の名刺はありません。新しい名刺は「取り込む」ボタンから追加できます。'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SearchBox initialQ={q} />
          <Link href="/contacts/import">
            <Button variant="cinnabar" size="default">
              <Plus aria-hidden className="size-4" />
              取り込む
            </Button>
          </Link>
        </div>
      </header>

      <div className="hairline" aria-hidden />

      <section
        aria-label="ステータス別の名刺"
        className="space-y-10 animate-fade-up [animation-delay:60ms]"
      >
        {total === 0 ? (
          <EmptyState query={q} />
        ) : (
          STATUS_ORDER.map((status) => {
            const list = groups.get(status) ?? [];
            if (list.length === 0) return null;
            runningNo += 1;
            return (
              <div key={status} className="space-y-4">
                <div className="flex items-baseline justify-between">
                  <div className="flex items-baseline gap-3">
                    <span className="section-no text-base">{sectionNo(runningNo)}</span>
                    <h2 className="display text-lg font-semibold tracking-crisp">
                      {CONTACT_STATUS_LABELS[status]}
                    </h2>
                    <span className="kicker tabular">{list.length} 件</span>
                  </div>
                  {status === 'pending_review' || status === 'duplicate_suspect' ? (
                    <p className="text-xs text-muted-foreground hidden sm:block">
                      クリックで確認画面へ
                    </p>
                  ) : null}
                </div>
                <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {list.map((c) => (
                    <li key={c.id}>
                      <ContactCard contact={c} />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}

function SearchBox({ initialQ }: { initialQ: string }) {
  return (
    <form action="/contacts" method="get" role="search">
      <label
        htmlFor="contacts-search"
        className={cn(
          'inline-flex items-center gap-2 rounded-md border border-border/70 bg-card/70',
          'px-3 h-11 min-w-[14rem] cursor-text',
          'shadow-[inset_0_1px_0_hsl(var(--surface-highlight)/0.5)]',
          'transition-[border-color,box-shadow] duration-fast ease-sumi',
          'focus-within:border-cinnabar/55 focus-within:shadow-focus-ring-cinnabar',
        )}
      >
        <Search aria-hidden strokeWidth={1.6} className="size-4 text-muted-foreground" />
        <input
          id="contacts-search"
          name="q"
          type="search"
          defaultValue={initialQ}
          placeholder="名前 / 会社 / 部署"
          aria-label="名刺を検索"
          className="bg-transparent outline-none text-sm w-full placeholder:text-muted-foreground/70"
        />
      </label>
    </form>
  );
}

function EmptyState({ query }: { query: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border/70 bg-card/40 p-10 text-center space-y-2">
      <p className="display text-base font-semibold tracking-crisp">
        「{query}」に一致する名刺は見つかりませんでした。
      </p>
      <p className="text-sm text-muted-foreground">
        漢字とふりがな・部署名どちらでも検索できます。
      </p>
      <Link
        href="/contacts"
        className="inline-flex items-center gap-1 text-sm text-cinnabar hover:underline mt-2"
      >
        検索をクリア
      </Link>
    </div>
  );
}

function ContactCard({ contact }: { contact: DemoContact }) {
  const owner = findMember(contact.ownerId);
  // verified / pending / duplicate いずれも詳細・編集は同一の review 画面で行う。
  // (Phase 2 で verified 専用の閲覧 view を追加する場合はここで分岐させる)
  const href = `/contacts/${contact.id}/review`;
  return (
    <Link href={href as never} className="group block focus-visible:outline-none">
      <Card interactive className="h-full p-5 space-y-4 focus-visible:shadow-focus-ring">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <p className="display text-base font-semibold tracking-crisp truncate">
              {contact.fullName}
            </p>
            <p className="text-xs text-muted-foreground truncate">{contact.furigana}</p>
          </div>
          <StatusBadge status={contact.status} />
        </div>

        <div className="space-y-1.5">
          <p className="text-sm font-medium tracking-crisp truncate">{contact.companyName}</p>
          <p className="text-xs text-muted-foreground truncate">{contact.title}</p>
        </div>

        {contact.note ? (
          <p className="text-xs leading-relaxed text-foreground/80 border-l-2 border-cinnabar/40 pl-3 py-0.5 line-clamp-2">
            {contact.note}
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              aria-hidden
              className="inline-flex items-center justify-center size-6 rounded-full bg-accent text-[10px] font-semibold tracking-tight"
            >
              {owner?.initials ?? '—'}
            </span>
            <span className="text-xs text-muted-foreground truncate">
              {owner?.fullName ?? '担当未設定'} ・ {formatDateJp(contact.capturedAt)}
            </span>
          </div>
          <ArrowUpRight
            aria-hidden
            className="size-4 text-muted-foreground transition-transform duration-fast ease-sumi group-hover:text-cinnabar group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          />
        </div>
      </Card>
    </Link>
  );
}

function StatusBadge({ status }: { status: DemoContactStatus }) {
  const cfg = {
    verified: {
      Icon: CheckCircle2,
      className: 'border-chitose/40 bg-chitose-muted/30 text-chitose',
    },
    pending_review: {
      Icon: AlertTriangle,
      className: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    },
    duplicate_suspect: {
      Icon: IdCard,
      className: 'border-cinnabar/40 bg-cinnabar/8 text-cinnabar',
    },
  } as const;
  const { Icon, className } = cfg[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 h-6 text-[10px] font-medium tracking-wide',
        'whitespace-nowrap shrink-0',
        className,
      )}
    >
      <Icon aria-hidden strokeWidth={1.6} className="size-3" />
      {CONTACT_STATUS_LABELS[status]}
    </span>
  );
}
