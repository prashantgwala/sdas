import { DashboardView } from "@/components/dashboard/dashboard-view";

export const metadata = { title: "System Dashboard" };

export default function Page() {
  return (
    <DashboardView
      role="SUPER_ADMIN"
      title="System Dashboard"
      description="Platform access, configuration and system health."
    />
  );
}
