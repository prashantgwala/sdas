import type { Metadata } from "next";
import { FileList } from "@/components/files/file-list";

export const metadata: Metadata = { title: "File approval queue" };

export default function DeptHeadFileApprovalsPage() {
  return (
    <FileList
      title="File approval queue"
      description="Files forwarded to your desk for approval. Open a file to review the noting trail, approve it or return it with remarks."
      defaultStatus="APPROVAL_PENDING"
    />
  );
}
