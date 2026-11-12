import type { Metadata } from "next";
import { IntegrationsView } from "@/components/admin/integrations-view";

export const metadata: Metadata = { title: "Integrations" };

export default function AdminIntegrationsPage() {
  return <IntegrationsView />;
}
