import type { Metadata } from "next";
import { ApprovalQueue } from "@/components/approvals/approval-queue";

export const metadata: Metadata = { title: "District approval queue" };

export default function DistrictApprovalsPage() {
  return <ApprovalQueue />;
}
