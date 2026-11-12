import type { Metadata } from "next";
import { FileList } from "@/components/files/file-list";

export const metadata: Metadata = { title: "Department files" };

export default function DeptHeadFilesPage() {
  return (
    <FileList
      title="Department files"
      description="Review file movement, pending approvals and the noting trail for your department."
    />
  );
}
