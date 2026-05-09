import { SectionSkeleton } from '@/components/layout/section-skeleton';

export default function Loading() {
  return <SectionSkeleton title="オンボーディング情報を読み込み中" rows={3} />;
}
