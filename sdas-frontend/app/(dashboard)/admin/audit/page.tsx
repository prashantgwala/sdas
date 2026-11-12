import type { Metadata } from "next";
import { AuditLogViewer } from "@/components/admin/audit-log-viewer";

export const metadata: Metadata = { title: "Audit logs" };

export default function AdminAuditPage() {
  return <AuditLogViewer />;
}
