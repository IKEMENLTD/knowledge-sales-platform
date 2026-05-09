import { PagePlaceholder } from '@/components/layout/placeholder';

export const metadata = { title: 'はじめに' };

export default function OnboardingPage() {
  return (
    <PagePlaceholder
      scCode="SC-61"
      title="はじめに (オンボーディング)"
      description="初回利用時の利用規約 / プライバシー同意と、Google Calendar 連携セットアップ。"
      helpText={[
        '19_onboarding_initial: ステップ 1 利用規約・プライバシーポリシー同意 (バージョン付き)。同意ログは audit_logs に保存。',
        'ステップ 2 Google Calendar 連携 (incremental authorization)。スキップ可。',
        'ステップ 3 通知設定 (商談リマインド / 録画完了通知)。デフォルト ON。',
        'ステップ 4 サンプルデータ案内 (sandbox 用 demo organization へのリンク)。',
      ].join('\n\n')}
    />
  );
}
