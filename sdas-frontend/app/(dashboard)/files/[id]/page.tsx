import type { Metadata } from "next";
import { Suspense } from "react";
import { FileDetail } from "@/components/files/file-detail";
import { LoadingBlock } from "@/components/ui/spinner";

export const metadata: Metadata = { title: "File" };

export default function FileDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<LoadingBlock label="Loading file" />}>
      <FileDetailRoute params={params} />
    </Suspense>
  );
}

async function FileDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FileDetail id={id} />;
}
