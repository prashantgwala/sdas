import { DashboardView } from "@/components/dashboard/dashboard-view";

export const metadata = { title: "District Dashboard" };

export default function Page() {
  return (
    <DashboardView
      role="DISTRICT_ADMIN"
      title="District Dashboard"
      description="District-wide oversight across departments and operations."
    />
  );
}
