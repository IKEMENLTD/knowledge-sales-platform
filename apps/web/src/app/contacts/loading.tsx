import { SectionSkeleton } from '@/components/layout/section-skeleton';

export default function Loading() {
  return <SectionSkeleton title="名刺データを読み込み中" rows={5} />;
}
