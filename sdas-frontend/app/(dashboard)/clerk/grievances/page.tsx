import type { Metadata } from "next";
import { GrievanceList } from "@/components/grievances/grievance-list";

export const metadata: Metadata = { title: "Incoming grievances" };

export default function ClerkGrievancesPage() {
  return (
    <GrievanceList
      title="Incoming grievances"
      description="Verify, classify and route grievances received by your department."
      createHref="/clerk/grievances/new"
    />
  );
}
