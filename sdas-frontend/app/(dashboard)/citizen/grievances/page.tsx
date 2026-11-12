import type { Metadata } from "next";
import { GrievanceList } from "@/components/grievances/grievance-list";

export const metadata: Metadata = { title: "My grievances" };

export default function CitizenGrievancesPage() {
  return (
    <GrievanceList
      title="My grievances"
      description="Track every complaint you have submitted, its current stage and the service deadline."
      createHref="/citizen/grievances/new"
    />
  );
}
