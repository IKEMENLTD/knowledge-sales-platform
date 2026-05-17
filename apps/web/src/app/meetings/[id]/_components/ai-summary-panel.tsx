import { Card } from '@/components/ui/card';
import { Sparkles } from 'lucide-react';
import { AiSectionEditDialogClient } from './ai-section-edit-dialog-client';

/**
 * 録画の AI 解析結果を 4 セクションで集約表示。
 *
 * 各セクションは
 *   - 要約 (summary): 文字列 1 つ
 *   - 重要点 (key_points): 箇条書き
 *   - 顧客ニーズ (customer_needs): 箇条書き
 *   - 反論 (objections): 箇条書き
 * を想定。録画が複数ある場合、呼び出し側で merge してから渡す。
 *
 * 編集は Dialog 経由で `PATCH /api/meetings/[id]` (ai_overrides) を叩く想定。
 * API 未配備時 (isSample=true) は読み取り専用で表示。
 */
export type AiSummaryPanelProps = {
  meetingId: string;
  summary: string | null;
  keyPoints: string[];
  customerNeeds: string[];
  objections: string[];
  isSample: boolean;
};

type SectionKey = 'summary' | 'keyPoints' | 'customerNeeds' | 'objections';

const SECTION_META: Record<SectionKey, { label: string; kicker: string }> = {
  summary: { label: '要約', kicker: '商談の地形' },
  keyPoints: { label: '重要点', kicker: '逃せない論点' },
  customerNeeds: { label: '顧客ニーズ', kicker: 'お客様の本音' },
  objections: { label: '反論・懸念', kicker: '抵抗の場所' },
};

export function AiSummaryPanel(props: AiSummaryPanelProps) {
  const { meetingId, summary, keyPoints, customerNeeds, objections, isSample } = props;

  return (
    <section aria-labelledby="ai-summary-heading" className="space-y-4">
      <div className="flex items-baseline gap-3">
        <Sparkles aria-hidden strokeWidth={1.6} className="size-5 text-cinnabar shrink-0" />
        <h2 id="ai-summary-heading" className="display text-lg font-semibold tracking-crisp">
          AI が読み解いた、商談の中身
        </h2>
        <span className="kicker">録画から自動抽出</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SummaryBlock
          meetingId={meetingId}
          field="summary"
          title={SECTION_META.summary.label}
          kicker={SECTION_META.summary.kicker}
          body={summary}
          isSample={isSample}
        />
        <ListBlock
          meetingId={meetingId}
          field="keyPoints"
          title={SECTION_META.keyPoints.label}
          kicker={SECTION_META.keyPoints.kicker}
          items={keyPoints}
          isSample={isSample}
        />
        <ListBlock
          meetingId={meetingId}
          field="customerNeeds"
          title={SECTION_META.customerNeeds.label}
          kicker={SECTION_META.customerNeeds.kicker}
          items={customerNeeds}
          isSample={isSample}
        />
        <ListBlock
          meetingId={meetingId}
          field="objections"
          title={SECTION_META.objections.label}
          kicker={SECTION_META.objections.kicker}
          items={objections}
          isSample={isSample}
        />
      </div>
    </section>
  );
}

function SummaryBlock({
  meetingId,
  field,
  title,
  kicker,
  body,
  isSample,
}: {
  meetingId: string;
  field: SectionKey;
  title: string;
  kicker: string;
  body: string | null;
  isSample: boolean;
}) {
  return (
    <Card className="p-5 space-y-3">
      <header className="flex items-baseline justify-between gap-2">
        <div>
          <p className="kicker">{kicker}</p>
          <h3 className="display text-base font-semibold tracking-crisp">{title}</h3>
        </div>
        <AiSectionEditDialogClient
          meetingId={meetingId}
          field={field}
          mode="text"
          initialText={body ?? ''}
          initialItems={null}
          sectionLabel={title}
          disabled={isSample}
        />
      </header>
      {body ? (
        <p className="text-sm leading-relaxed text-foreground/85 whitespace-pre-line">{body}</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          録画が解析されると、ここに 90 字目安の要約が出ます。
        </p>
      )}
    </Card>
  );
}

function ListBlock({
  meetingId,
  field,
  title,
  kicker,
  items,
  isSample,
}: {
  meetingId: string;
  field: SectionKey;
  title: string;
  kicker: string;
  items: string[];
  isSample: boolean;
}) {
  return (
    <Card className="p-5 space-y-3">
      <header className="flex items-baseline justify-between gap-2">
        <div>
          <p className="kicker">{kicker}</p>
          <h3 className="display text-base font-semibold tracking-crisp">{title}</h3>
        </div>
        <AiSectionEditDialogClient
          meetingId={meetingId}
          field={field}
          mode="list"
          initialText={null}
          initialItems={items}
          sectionLabel={title}
          disabled={isSample}
        />
      </header>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">該当なし</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((it, i) => (
            <li
              // 本文 + index を組み合わせて一意化 (本文が重複する稀な編集状態を保護)
              key={`${field}-${i}-${it.slice(0, 24)}`}
              className="flex gap-2 text-sm leading-relaxed text-foreground/85"
            >
              <span
                aria-hidden
                className="text-cinnabar mt-0.5 font-semibold leading-none tabular shrink-0"
              >
                ・
              </span>
              <span>{it}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
