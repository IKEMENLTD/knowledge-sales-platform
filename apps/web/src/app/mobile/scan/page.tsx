import { PagePlaceholder } from '@/components/layout/placeholder';

export const metadata = { title: '名刺スキャン' };

export default function MobileScanPage() {
  return (
    <PagePlaceholder
      scCode="SC-33"
      taskCode="T-008"
      kicker="モバイル / スキャン"
      title="名刺を、その場で取り込む。"
      description="商談直後の交換した名刺を、片手でカメラに向けるだけで自動で記録します。"
      helpText={`手ブレや反射が出やすい暗所でも、ガイド枠と自動シャッターでブレのない一枚を撮ります。
連射モードで会場で集めた名刺を一気に取り込み、移動中に整理することもできます。
通信が不安定な場所でも端末内に安全に保管され、オンラインに戻ってから自動で同期されます。`}
      comingSoonNote="撮影した画像は端末内で暗号化して保管されます。組織の管理者がメンバーを停止すると、その場で全消去されます。"
    />
  );
}
