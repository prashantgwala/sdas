import type { Metadata } from "next";
import { Suspense } from "react";
import { RoadDetail } from "@/components/roads/road-detail";
import { LoadingBlock } from "@/components/ui/spinner";

export const metadata: Metadata = { title: "Road report" };

export default function RoadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<LoadingBlock label="Loading road report" />}>
      <RoadDetailRoute params={params} />
    </Suspense>
  );
}

async function RoadDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RoadDetail id={id} />;
}
