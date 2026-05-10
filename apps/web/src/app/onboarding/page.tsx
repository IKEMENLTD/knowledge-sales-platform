import { Calendar, Check, Database, FileText } from 'lucide-react';
import { PagePlaceholder } from '@/components/layout/placeholder';

export const metadata = { title: 'はじめての設定' };

const STEPS = [
  {
    Icon: FileText,
    title: '利用規約に同意する',
    body: 'プライバシーポリシーと社内利用規程をご確認ください。同意の記録は安全に保管されます。',
  },
  {
    Icon: Calendar,
    title: 'Google カレンダーをつなげる',
    body: '今日の商談予定をホームに自動表示します。Google からの権限要求の画面はその場で確認できます。',
  },
  {
    Icon: Database,
    title: 'サンプルデータで触ってみる',
    body: '実際の商談データを入れる前に、ダミーの商談・名刺で操作感を確かめられます。',
  },
];

export default function OnboardingPage() {
  return (
    <PagePlaceholder
      scCode="SC-61"
      kicker="セットアップ / 初回"
      title="ようこそ。最初に3つだけ設定します。"
      description="ここで決めたことは、あとから「設定」画面で変更できます。"
      helpText={`順番に進めると、3〜4分で日常的な使い方の準備が整います。
途中で止めても自動で保存されます。次回ログインしたときに続きから再開できます。`}
    >
      <ol className="mt-6 space-y-3">
        {STEPS.map((step, i) => (
          <li
            key={step.title}
            className="flex items-start gap-4 rounded-lg border border-border/60 bg-card/60 p-4 shadow-sumi-sm"
          >
            <span
              aria-hidden
              className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-foreground/70 font-display font-semibold tabular"
            >
              {i + 1}
            </span>
            <div className="flex-1">
              <h3 className="display flex items-center gap-2 text-[0.95rem] font-semibold tracking-crisp">
                <step.Icon aria-hidden strokeWidth={1.6} className="size-4 text-cinnabar" />
                {step.title}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </div>
            <Check
              aria-hidden
              strokeWidth={1.6}
              className="size-4 shrink-0 text-muted-foreground/40"
            />
          </li>
        ))}
      </ol>
    </PagePlaceholder>
  );
}
