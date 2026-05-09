import { SectionSkeleton } from '@/components/layout/section-skeleton';

export default function Loading() {
  return <SectionSkeleton title="商談一覧を読み込み中" rows={5} />;
}
