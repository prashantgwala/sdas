import { DashboardView } from "@/components/dashboard/dashboard-view";

export const metadata = { title: "Clerk Dashboard" };

export default function Page() {
  return (
    <DashboardView
      role="CLERK"
      title="Clerk Dashboard"
      description="Intake, verification and routing work for your department."
    />
  );
}
