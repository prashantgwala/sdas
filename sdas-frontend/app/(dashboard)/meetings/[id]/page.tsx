import type { Metadata } from "next";
import { Suspense } from "react";
import { MeetingDetail } from "@/components/meetings/meeting-detail";
import { LoadingBlock } from "@/components/ui/spinner";

export const metadata: Metadata = { title: "Meeting" };

export default function MeetingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<LoadingBlock label="Loading meeting" />}>
      <MeetingDetailRoute params={params} />
    </Suspense>
  );
}

async function MeetingDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MeetingDetail id={id} />;
}
