import type { Metadata } from "next";
import { FileList } from "@/components/files/file-list";

export const metadata: Metadata = { title: "Assigned files" };

export default function OfficerFilesPage() {
  return (
    <FileList
      title="Assigned files"
      description="Files currently in your custody or moving through your department."
    />
  );
}
