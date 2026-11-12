import type { Metadata } from "next";
import { GrievanceList } from "@/components/grievances/grievance-list";

export const metadata: Metadata = { title: "Department grievances" };

export default function DeptHeadGrievancesPage() {
  return (
    <GrievanceList
      title="Department grievances"
      description="Monitor grievance load, decide pending resolutions and review reopen requests for your department."
    />
  );
}
