import type { Metadata } from "next";
import { Suspense } from "react";
import { HelpdeskDetail } from "@/components/support/helpdesk-detail";
import { LoadingBlock } from "@/components/ui/spinner";

export const metadata: Metadata = { title: "Support ticket" };

export default function CitizenHelpdeskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<LoadingBlock label="Loading ticket" />}>
      <CitizenHelpdeskDetailRoute params={params} />
    </Suspense>
  );
}

async function CitizenHelpdeskDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <HelpdeskDetail id={id} audience="citizen" />;
}
