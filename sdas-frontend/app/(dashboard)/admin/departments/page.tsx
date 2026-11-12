import type { Metadata } from "next";
import { OrgManager } from "@/components/admin/org-manager";
import { PageHeader } from "@/components/dashboard/ui";

export const metadata: Metadata = { title: "Departments & organization" };

export default function AdminDepartmentsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Organization"
        title="Departments & offices"
        description="Maintain the district's departments, administrative units and field offices, and keep the district profile used for SLA working hours current."
      />
      <OrgManager />
    </>
  );
}
