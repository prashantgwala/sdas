import type { Metadata } from "next";
import { FileList } from "@/components/files/file-list";

export const metadata: Metadata = { title: "Department files" };

export default function ClerkFilesPage() {
  return (
    <FileList
      title="Department files"
      description="Register, dispatch and track files owned by your department."
      registerHref="/clerk/files/new"
    />
  );
}
