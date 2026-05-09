import { PagePlaceholder } from '@/components/layout/placeholder';

export const metadata = { title: '名刺取込' };

export default function ContactsImportPage() {
  return (
    <PagePlaceholder
      scCode="SC-06"
      taskCode="T-007"
      title="名刺取込"
      description="名刺画像をアップロードすると、OCR + LLM 補正で連絡先データを自動抽出します。"
      helpText={[
        '対応フォーマット: JPEG / PNG / HEIC (最大 10MB / 1ファイル)。',
        '複数枚アップロード可。バックグラウンドで OCR 処理が走り、完了後に SC-08 のレビュー画面で確認・修正してから保存します。',
        'モバイルでは SC-33「名刺スキャン」からカメラで直接取込が可能です (オフライン時は SC-34 のキューに保存され、復帰後に自動同期)。',
      ].join('\n\n')}
    />
  );
}
