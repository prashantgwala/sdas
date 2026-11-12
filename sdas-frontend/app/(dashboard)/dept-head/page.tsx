import { DashboardView } from "@/components/dashboard/dashboard-view";

export const metadata = { title: "Department Dashboard" };

export default function Page() {
  return (
    <DashboardView
      role="DEPARTMENT_HEAD"
      title="Department Dashboard"
      description="Department performance, approvals and team workload."
    />
  );
}
