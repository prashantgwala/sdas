import type { Metadata } from "next";
import { ApplicationTypeManager } from "@/components/admin/application-type-manager";

export const metadata: Metadata = { title: "Application configuration" };

export default function AdminApplicationConfigPage() {
  return <ApplicationTypeManager />;
}
