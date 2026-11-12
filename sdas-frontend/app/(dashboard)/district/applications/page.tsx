import type { Metadata } from "next";
import { ApplicationList } from "@/components/applications/application-list";

export const metadata: Metadata = { title: "District applications" };

export default function DistrictApplicationsPage() {
  return (
    <ApplicationList
      title="District applications"
      description="All service applications across departments with SLA and decision status."
      showDepartmentFilter
    />
  );
}
