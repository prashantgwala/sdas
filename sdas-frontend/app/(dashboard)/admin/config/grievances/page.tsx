import type { Metadata } from "next";
import { GrievanceConfigManager } from "@/components/admin/grievance-config-manager";

export const metadata: Metadata = { title: "Grievance configuration" };

export default function AdminGrievanceConfigPage() {
  return <GrievanceConfigManager />;
}
