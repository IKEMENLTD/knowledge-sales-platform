import { Card } from '@/components/ui/card';
import { Users } from 'lucide-react';
import Link from 'next/link';

export type RelatedContact = {
  id: string;
  fullName: string;
  title: string | null;
  companyName: string | null;
  email: string | null;
  /** この商談の出席者なら true、過去商談からの関連なら false */
  isAttendee: boolean;
  /** 過去商談数 (関連 contact の場合) */
  pastMeetingCount?: number;
};

/**
 * 商談の出席者 + 同社の過去商談 contact をひとまとめに。
 * 「同じ会社で過去にどんな人とどれくらい話したか」を 1 ブロックで把握できる。
 */
export function RelatedContacts({
  contacts,
}: {
  contacts: RelatedContact[];
}) {
  const attendees = contacts.filter((c) => c.isAttendee);
  const related = contacts.filter((c) => !c.isAttendee);

  return (
    <section aria-labelledby="related-contacts-heading" className="space-y-3">
      <div className="flex items-baseline gap-3">
        <Users aria-hidden strokeWidth={1.6} className="size-5 text-cinnabar shrink-0" />
        <h2 id="related-contacts-heading" className="display text-lg font-semibold tracking-crisp">
          関係者
        </h2>
        <span className="kicker tabular">{contacts.length} 名</span>
      </div>

      <Card className="p-5 space-y-5">
        <SubGroup title="この商談の出席者" items={attendees} emptyHint="出席者は未登録です" />
        {related.length > 0 ? (
          <>
            <div className="hairline" aria-hidden />
            <SubGroup title="同じ会社の関連連絡先" items={related} emptyHint="" />
          </>
        ) : null}
      </Card>
    </section>
  );
}

function SubGroup({
  title,
  items,
  emptyHint,
}: {
  title: string;
  items: RelatedContact[];
  emptyHint: string;
}) {
  return (
    <div className="space-y-2">
      <p className="kicker">{title}</p>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyHint}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((c) => (
            <li key={c.id}>
              <Link
                href={`/contacts/${c.id}` as never}
                className="flex items-start gap-3 p-2 -mx-2 rounded-md hover:bg-accent/60 focus-visible:outline-none focus-visible:shadow-focus-ring"
              >
                <span
                  aria-hidden
                  className="inline-flex items-center justify-center size-9 rounded-full bg-accent text-xs font-semibold tracking-tight shrink-0"
                >
                  {initialsOf(c.fullName)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-snug truncate">{c.fullName}</p>
                  <p className="text-xs text-muted-foreground leading-snug truncate">
                    {c.title ?? '—'}
                    {c.companyName ? ` ・ ${c.companyName}` : ''}
                  </p>
                  {c.pastMeetingCount && c.pastMeetingCount > 0 ? (
                    <p className="kicker tabular mt-0.5">過去 {c.pastMeetingCount} 件の商談</p>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
  return name.slice(0, 2);
}
