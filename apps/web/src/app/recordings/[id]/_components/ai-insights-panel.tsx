'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { Pencil, Sparkles, X } from 'lucide-react';
import { type ReactNode, useCallback, useState } from 'react';

/**
 * AI 推論結果 4 セクションパネル: 要約 / キーポイント / 顧客ニーズ / 反論。
 *
 *  - 各セクションは read-only 表示、「編集」ボタンで Dialog を開いて textarea 上書き
 *  - PATCH /api/recordings/[id] は別途。本コンポーネントは onSectionSave コールバックを発火するのみ
 *  - サンプルモード (readOnly=true) では「編集」ボタンを disabled にしてヒントを出す
 */

export type AiSectionKey = 'summary' | 'keyPoints' | 'customerNeeds' | 'objections';

export interface AiInsightsPanelProps {
  recordingId: string;
  summary: string | null;
  keyPoints: string[];
  customerNeeds: string[];
  objections: string[];
  /** 本DB由来 (= 編集を実 API へ送れる) なら true。fixture fallback なら false */
  editable: boolean;
  onSectionSave?: (key: AiSectionKey, nextValue: string | string[]) => Promise<void> | void;
}

const SECTION_META: Record<
  AiSectionKey,
  { title: string; description: string; kind: 'text' | 'list' }
> = {
  summary: {
    title: '要約',
    description: '商談の流れと結論を 90 字目安でまとめます。',
    kind: 'text',
  },
  keyPoints: {
    title: 'キーポイント',
    description: '次回までに覚えておくべき発言・数字・条件。',
    kind: 'list',
  },
  customerNeeds: {
    title: '顧客ニーズ',
    description: 'お客様が解決したい課題・期待値・優先順位。',
    kind: 'list',
  },
  objections: {
    title: '反論・懸念',
    description: '購買の妨げになりそうな疑問・反対意見・条件。',
    kind: 'list',
  },
};

export function AiInsightsPanel({
  summary,
  keyPoints,
  customerNeeds,
  objections,
  editable,
  onSectionSave,
}: AiInsightsPanelProps) {
  const [activeKey, setActiveKey] = useState<AiSectionKey | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const readSection = useCallback(
    (key: AiSectionKey): string | string[] => {
      switch (key) {
        case 'summary':
          return summary ?? '';
        case 'keyPoints':
          return keyPoints;
        case 'customerNeeds':
          return customerNeeds;
        case 'objections':
          return objections;
      }
    },
    [summary, keyPoints, customerNeeds, objections],
  );

  const openEdit = useCallback(
    (key: AiSectionKey) => {
      const v = readSection(key);
      setActiveKey(key);
      setDraft(Array.isArray(v) ? v.join('\n') : v);
    },
    [readSection],
  );

  const closeEdit = useCallback(() => {
    setActiveKey(null);
    setDraft('');
    setSaving(false);
  }, []);

  const commit = useCallback(async () => {
    if (!activeKey) return;
    setSaving(true);
    try {
      const meta = SECTION_META[activeKey];
      const next: string | string[] =
        meta.kind === 'list'
          ? draft
              .split(/\r?\n/)
              .map((l) => l.trim())
              .filter((l) => l.length > 0)
          : draft.trim();
      await onSectionSave?.(activeKey, next);
      closeEdit();
    } catch {
      setSaving(false);
    }
  }, [activeKey, draft, onSectionSave, closeEdit]);

  return (
    <Card className="p-5 md:p-6 space-y-5">
      <header className="flex items-baseline justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-flex items-center justify-center size-6 rounded-md bg-cinnabar/12 text-cinnabar"
          >
            <Sparkles strokeWidth={1.6} className="size-3.5" />
          </span>
          <p className="kicker">AI が読み解いたこと</p>
        </div>
        {!editable ? (
          <span className="kicker text-muted-foreground">サンプル ・ 編集不可</span>
        ) : null}
      </header>

      <Section
        title={SECTION_META.summary.title}
        body={
          summary ? <p className="text-sm leading-relaxed text-foreground/85">{summary}</p> : null
        }
        onEdit={() => openEdit('summary')}
        editable={editable}
        empty="まだ要約がありません。"
      />

      <Section
        title={SECTION_META.keyPoints.title}
        body={renderBullets(keyPoints)}
        onEdit={() => openEdit('keyPoints')}
        editable={editable}
        empty="キーポイントはまだ抽出されていません。"
      />

      <Section
        title={SECTION_META.customerNeeds.title}
        body={renderBullets(customerNeeds)}
        onEdit={() => openEdit('customerNeeds')}
        editable={editable}
        empty="顧客ニーズはまだ抽出されていません。"
      />

      <Section
        title={SECTION_META.objections.title}
        body={renderBullets(objections, true)}
        onEdit={() => openEdit('objections')}
        editable={editable}
        empty="反論や懸念は記録されていません。"
      />

      <Dialog open={activeKey !== null} onOpenChange={(open) => !open && closeEdit()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{activeKey ? SECTION_META[activeKey].title : ''} を編集</DialogTitle>
            <DialogDescription>
              {activeKey ? SECTION_META[activeKey].description : ''}
              {activeKey && SECTION_META[activeKey].kind === 'list'
                ? ' 改行で 1 項目ずつ入力します。'
                : ''}
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={8}
            aria-label="編集内容"
            className={cn(
              'w-full rounded-md border border-border bg-surface-inset/60 px-3 py-2',
              'text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/60',
              'focus-visible:outline-none focus-visible:border-ring',
              'focus-visible:shadow-[0_0_0_3px_hsl(var(--ring)/0.18)]',
            )}
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={closeEdit}>
              <X strokeWidth={1.6} className="size-4" />
              キャンセル
            </Button>
            <Button
              type="button"
              variant="cinnabar"
              onClick={commit}
              disabled={saving || !editable}
            >
              {saving ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Section({
  title,
  body,
  onEdit,
  editable,
  empty,
}: {
  title: string;
  body: ReactNode;
  onEdit: () => void;
  editable: boolean;
  empty: string;
}) {
  return (
    <section className="space-y-2 border-l-2 border-cinnabar/40 pl-3">
      <header className="flex items-center justify-between gap-2">
        <h3 className="display text-sm font-semibold tracking-crisp">{title}</h3>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onEdit}
          disabled={!editable}
          aria-label={`${title} を編集`}
          title={editable ? '編集' : 'サンプルのため編集できません'}
          className="size-7"
        >
          <Pencil strokeWidth={1.6} className="size-3.5" />
        </Button>
      </header>
      {body ?? <p className="text-xs text-muted-foreground italic">{empty}</p>}
    </section>
  );
}

function renderBullets(items: string[], emphasis = false): ReactNode {
  if (!items || items.length === 0) return null;
  return (
    <ul className="space-y-1.5">
      {items.map((s, i) => (
        <li
          // eslint-disable-next-line react/no-array-index-key
          key={`${i}-${s.slice(0, 16)}`}
          className="flex items-start gap-2 text-sm leading-relaxed text-foreground/85"
        >
          <span
            aria-hidden
            className={cn(
              'mt-2 inline-block size-1.5 rounded-full shrink-0',
              emphasis ? 'bg-amber-500/70' : 'bg-cinnabar/70',
            )}
          />
          <span>{s}</span>
        </li>
      ))}
    </ul>
  );
}
