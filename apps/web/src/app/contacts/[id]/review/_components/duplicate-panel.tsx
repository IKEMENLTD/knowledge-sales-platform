'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { ContactMergeRequest, DuplicateCandidate, MatchField } from '@ksp/shared';
import { AlertCircle, GitMerge, Split } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

/**
 * 重複候補パネル — 名刺レビュー画面の中段に出る。
 *
 *  - 候補ごとに side-by-side card (現在の名刺 vs 既存の名刺) を最小情報で並べる
 *  - matchFields chip で「なぜ重複候補なのか」を一目で示す
 *  - 3 つの解決手段:
 *      (A) これを残してマージ  → resolution=merged, masterContactId = currentContactId
 *      (B) 相手を残してマージ  → resolution=merged, masterContactId = candidate.contactId
 *      (C) 別人として登録      → resolution=kept_separate
 *  - 候補 0 件なら panel 自体を非表示 (上位でガード)
 */

const MATCH_LABEL: Record<MatchField, { label: string; tone: 'cinnabar' | 'chitose' | 'amber' }> = {
  email: { label: 'メール一致', tone: 'cinnabar' },
  phone: { label: '電話番号一致', tone: 'cinnabar' },
  name_company: { label: '同姓 + 同社', tone: 'amber' },
  image_hash: { label: '同じ画像', tone: 'cinnabar' },
  linkedin: { label: 'LinkedIn 一致', tone: 'chitose' },
};

const MATCH_TONE_CLASS: Record<'cinnabar' | 'chitose' | 'amber', string> = {
  cinnabar: 'border-cinnabar/40 bg-cinnabar/8 text-cinnabar',
  chitose: 'border-chitose/40 bg-chitose-muted/30 text-chitose',
  amber: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
};

interface DuplicatePanelProps {
  currentContactId: string;
  currentName: string;
  currentCompany: string | null;
  candidates: DuplicateCandidate[];
}

type ResolveKind = 'keep_current' | 'keep_other' | 'separate';

export function DuplicatePanel({
  currentContactId,
  currentName,
  currentCompany,
  candidates,
}: DuplicatePanelProps) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);

  if (candidates.length === 0) return null;

  const resolve = async (candidate: DuplicateCandidate, kind: ResolveKind) => {
    const body: ContactMergeRequest =
      kind === 'separate'
        ? { resolution: 'kept_separate' }
        : {
            resolution: 'merged',
            masterContactId: kind === 'keep_current' ? currentContactId : candidate.contactId,
          };

    const idempotencyKey = crypto.randomUUID();
    setPendingId(`${candidate.contactId}:${kind}`);
    try {
      const res = await fetch(`/api/contacts/${currentContactId}/merge`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': idempotencyKey,
        },
        body: JSON.stringify(body),
      });

      if (res.status === 404) {
        toast.info('マージ API がまだ準備中です', {
          description: '操作は記録されません。',
        });
        return;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        toast.error(`マージに失敗しました (${res.status})`, {
          description: text ? text.slice(0, 160) : undefined,
        });
        return;
      }

      if (kind === 'keep_other') {
        toast.success('既存の名刺に統合しました');
        router.push(`/contacts/${candidate.contactId}/review`);
        router.refresh();
      } else if (kind === 'keep_current') {
        toast.success('こちらに統合しました');
        router.refresh();
      } else {
        toast.success('別人として登録しました');
        router.refresh();
      }
    } catch (err) {
      if (err instanceof TypeError) {
        toast.info('ネットワークに接続できませんでした');
        return;
      }
      toast.error('予期しないエラーが発生しました');
    } finally {
      setPendingId(null);
    }
  };

  return (
    <section aria-label="重複の候補" className="space-y-4 animate-fade-up [animation-delay:60ms]">
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-3">
          <span className="section-no text-base">№ 03</span>
          <h2 className="display text-lg font-semibold tracking-crisp">同じ人かもしれません</h2>
          <span className="kicker tabular">{candidates.length} 件</span>
        </div>
        <p className="text-xs text-muted-foreground hidden sm:flex items-center gap-1.5">
          <AlertCircle aria-hidden strokeWidth={1.6} className="size-3.5" />
          メール / 電話 / 同社で一致した既存登録があります
        </p>
      </div>

      <ul className="space-y-3">
        {candidates.map((cand) => {
          const isMatch = (k: ResolveKind) => pendingId === `${cand.contactId}:${k}`;
          const anyPending = pendingId?.startsWith(`${cand.contactId}:`) ?? false;
          return (
            <li key={cand.contactId}>
              <Card className="p-5 space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:divide-x md:divide-border/60">
                  <PartySnapshot
                    heading="こちらの名刺 (新規)"
                    name={currentName}
                    company={currentCompany}
                    email={null}
                    capturedAt={null}
                    accent="cinnabar"
                  />
                  <PartySnapshot
                    heading="既存の名刺"
                    name={cand.name}
                    company={cand.companyName}
                    email={cand.email}
                    capturedAt={cand.capturedAt}
                    accent="muted"
                    className="md:pl-4"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {cand.matchFields.map((mf) => {
                    const cfg = MATCH_LABEL[mf];
                    return (
                      <span
                        key={mf}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full border px-2 h-5 text-[10px] font-medium',
                          MATCH_TONE_CLASS[cfg.tone],
                        )}
                      >
                        {cfg.label}
                      </span>
                    );
                  })}
                  <span className="tabular text-[10px] text-muted-foreground ml-auto">
                    一致度 {Math.round(cand.matchScore * 100)}%
                  </span>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={anyPending}
                    onClick={() => resolve(cand, 'separate')}
                  >
                    <Split aria-hidden className="size-4" />
                    別人として登録
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={anyPending}
                    onClick={() => resolve(cand, 'keep_other')}
                    title="既存側を残し、こちらをマージ"
                  >
                    <GitMerge aria-hidden className="size-4" />
                    相手を残してマージ
                  </Button>
                  <Button
                    type="button"
                    variant="cinnabar"
                    size="sm"
                    disabled={anyPending}
                    onClick={() => resolve(cand, 'keep_current')}
                  >
                    {isMatch('keep_current') ? (
                      <GitMerge aria-hidden className="size-4 animate-pulse" />
                    ) : (
                      <GitMerge aria-hidden className="size-4" />
                    )}
                    これを残してマージ
                  </Button>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function PartySnapshot({
  heading,
  name,
  company,
  email,
  capturedAt,
  accent,
  className,
}: {
  heading: string;
  name: string;
  company: string | null;
  email: string | null;
  capturedAt: string | null;
  accent: 'cinnabar' | 'muted';
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <p
        className={cn('kicker', accent === 'cinnabar' ? 'text-cinnabar' : 'text-muted-foreground')}
      >
        {heading}
      </p>
      <p className="display text-base font-semibold tracking-crisp truncate">{name}</p>
      <p className="text-sm text-foreground/80 truncate">{company ?? '—'}</p>
      {email ? <p className="text-xs text-muted-foreground truncate">{email}</p> : null}
      {capturedAt ? (
        <p className="text-[11px] text-muted-foreground tabular">
          取込:{' '}
          {new Intl.DateTimeFormat('ja-JP', { month: 'short', day: 'numeric' }).format(
            new Date(capturedAt),
          )}
        </p>
      ) : null}
    </div>
  );
}
