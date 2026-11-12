import type { Metadata } from "next";
import { Suspense } from "react";
import { RoleScope } from "@/components/dashboard/role-scope";
import { HelpdeskDetail } from "@/components/support/helpdesk-detail";
import { LoadingBlock } from "@/components/ui/spinner";

export const metadata: Metadata = { title: "Support ticket" };

export default function HelpdeskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <RoleScope allowed={["CLERK", "OFFICER", "DEPARTMENT_HEAD", "DISTRICT_ADMIN", "SUPER_ADMIN"]}>
      <Suspense fallback={<LoadingBlock label="Loading ticket" />}>
        <HelpdeskDetailRoute params={params} />
      </Suspense>
    </RoleScope>
  );
}

async function HelpdeskDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <HelpdeskDetail id={id} audience="staff" />;
}
