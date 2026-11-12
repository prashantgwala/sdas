import type { Metadata } from "next";
import { Suspense } from "react";
import { IncidentDetail } from "@/components/disaster/incident-detail";
import { LoadingBlock } from "@/components/ui/spinner";

export const metadata: Metadata = { title: "Incident" };

export default function IncidentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<LoadingBlock label="Loading incident" />}>
      <IncidentDetailRoute params={params} />
    </Suspense>
  );
}

async function IncidentDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <IncidentDetail id={id} />;
}
