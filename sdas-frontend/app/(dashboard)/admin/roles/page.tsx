import type { Metadata } from "next";
import { RoleManager } from "@/components/admin/role-manager";

export const metadata: Metadata = { title: "Roles & permissions" };

export default function AdminRolesPage() {
  return <RoleManager />;
}
