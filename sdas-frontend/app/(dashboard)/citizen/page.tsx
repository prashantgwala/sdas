import { DashboardView } from "@/components/dashboard/dashboard-view";

export const metadata = { title: "Citizen Dashboard" };

export default function Page() {
  return (
    <DashboardView
      role="CITIZEN"
      title="Citizen Dashboard"
      description="Track your grievances, applications and documents in one place."
    />
  );
}
