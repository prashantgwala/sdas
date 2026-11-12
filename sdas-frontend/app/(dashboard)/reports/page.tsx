import type { Metadata } from "next";
import { RoleScope } from "@/components/dashboard/role-scope";
import { ReportView } from "@/components/reports/report-view";

export const metadata: Metadata = { title: "Reports & analytics" };

export default function ReportsPage() {
  return (
    <RoleScope allowed={["CLERK", "OFFICER", "DEPARTMENT_HEAD", "DISTRICT_ADMIN", "SUPER_ADMIN"]}>
      <ReportView />
    </RoleScope>
  );
}
