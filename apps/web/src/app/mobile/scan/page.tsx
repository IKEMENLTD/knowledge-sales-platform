import { PagePlaceholder } from '@/components/layout/placeholder';

export const metadata = { title: '名刺スキャン' };

export default function MobileScanPage() {
  return (
    <PagePlaceholder
      scCode="SC-33"
      taskCode="T-008"
      title="名刺スキャン (モバイル)"
      description="スマホカメラで名刺を直接撮影し、その場で OCR にかけます。"
      helpText={[
        'getUserMedia でカメラ呼び出し → エッジ検出ガイド → シャッター。Permissions-Policy で camera=self を許可済み。',
        'オフライン時 (17_offline_mobile): 撮影画像は IndexedDB の offline_queue に暗号化保存され、オンライン復帰時に自動アップロード。',
        '連続撮影モード: 名刺交換ラッシュに対応。1 名刺 = 1 タップで連射、後で SC-08 でまとめてレビュー可能。',
      ].join('\n\n')}
    />
  );
}
