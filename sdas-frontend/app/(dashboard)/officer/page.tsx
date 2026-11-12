import { DashboardView } from "@/components/dashboard/dashboard-view";

export const metadata = { title: "Officer Dashboard" };

export default function Page() {
  return (
    <DashboardView
      role="OFFICER"
      title="Officer Dashboard"
      description="Assigned cases, deadlines and field actions."
    />
  );
}
