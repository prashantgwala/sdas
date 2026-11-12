import type { Metadata } from "next";
import { GrievanceList } from "@/components/grievances/grievance-list";

export const metadata: Metadata = { title: "Assigned grievances" };

export default function OfficerGrievancesPage() {
  return (
    <GrievanceList
      title="Assigned grievances"
      description="Investigate complaints assigned to you or awaiting action in your department."
    />
  );
}
