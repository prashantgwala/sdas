import type { Metadata } from "next";
import { Suspense } from "react";
import { UserDetail } from "@/components/admin/user-detail";
import { LoadingBlock } from "@/components/ui/spinner";

export const metadata: Metadata = { title: "User account" };

export default function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<LoadingBlock label="Loading user" />}>
      <UserDetailRoute params={params} />
    </Suspense>
  );
}

async function UserDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <UserDetail userId={id} />;
}
