import type { Metadata } from "next";
import { Suspense } from "react";
import { ApplicationDetail } from "@/components/applications/application-detail";
import { LoadingBlock } from "@/components/ui/spinner";

export const metadata: Metadata = { title: "Application" };

export default function ApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<LoadingBlock label="Loading application" />}>
      <ApplicationDetailRoute params={params} />
    </Suspense>
  );
}

async function ApplicationDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ApplicationDetail id={id} />;
}
