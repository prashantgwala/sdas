import type { Metadata } from "next";
import { ApplicationList } from "@/components/applications/application-list";

export const metadata: Metadata = { title: "Department applications" };

export default function DeptHeadApplicationsPage() {
  return (
    <ApplicationList
      title="Department applications"
      description="Assign officers, monitor deadlines and record decisions for your department."
    />
  );
}
