import type { Metadata } from "next";
import { FileConfigManager } from "@/components/admin/file-config-manager";

export const metadata: Metadata = { title: "File configuration" };

export default function AdminFileConfigPage() {
  return <FileConfigManager />;
}
