import { SectionSkeleton } from '@/components/layout/section-skeleton';

export default function Loading() {
  return <SectionSkeleton title="録画一覧を読み込み中" rows={5} />;
}
