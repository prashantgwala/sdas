import type { Metadata } from "next";
import { FileList } from "@/components/files/file-list";

export const metadata: Metadata = { title: "District files" };

export default function DistrictFilesPage() {
  return (
    <FileList
      title="District files"
      description="Every tracked file across departments with custody, classification and deadline."
      showDepartmentFilter
    />
  );
}
