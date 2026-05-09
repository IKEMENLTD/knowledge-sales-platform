import { SectionSkeleton } from '@/components/layout/section-skeleton';

export default function Loading() {
  return <SectionSkeleton title="検索結果を読み込み中" rows={6} />;
}
