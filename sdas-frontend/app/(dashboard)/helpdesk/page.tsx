import type { Metadata } from "next";
import { RoleScope } from "@/components/dashboard/role-scope";
import { StaffHelpdesk } from "@/components/support/staff-helpdesk";

export const metadata: Metadata = { title: "Helpdesk queue" };

export default function HelpdeskPage() {
  return (
    <RoleScope allowed={["CLERK", "OFFICER", "DEPARTMENT_HEAD", "DISTRICT_ADMIN", "SUPER_ADMIN"]}>
      <StaffHelpdesk />
    </RoleScope>
  );
}
