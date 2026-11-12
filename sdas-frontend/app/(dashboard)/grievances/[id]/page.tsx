import type { Metadata } from "next";
import { Suspense } from "react";
import { GrievanceDetail } from "@/components/grievances/grievance-detail";
import { LoadingBlock } from "@/components/ui/spinner";

export const metadata: Metadata = { title: "Grievance" };

export default function GrievanceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<LoadingBlock label="Loading grievance" />}>
      <GrievanceDetailRoute params={params} />
    </Suspense>
  );
}

async function GrievanceDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GrievanceDetail id={id} />;
}
