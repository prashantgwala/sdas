import type { Metadata } from "next";
import { GrievanceList } from "@/components/grievances/grievance-list";

export const metadata: Metadata = { title: "District grievances" };

export default function DistrictGrievancesPage() {
  return (
    <GrievanceList
      title="District grievances"
      description="Every grievance across the district with SLA position, department ownership and escalation state."
      showDepartmentFilter
    />
  );
}
