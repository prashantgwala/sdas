import type { Metadata } from "next";
import { OfficerWorkloadView } from "@/components/dept-head/officer-workload-view";

export const metadata: Metadata = { title: "Department officers" };

export default function DepartmentOfficersPage() {
  return <OfficerWorkloadView />;
}
