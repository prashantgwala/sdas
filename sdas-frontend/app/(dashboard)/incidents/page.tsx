import type { Metadata } from "next";
import { IncidentList } from "@/components/disaster/incident-list";

export const metadata: Metadata = { title: "Incidents" };

export default function IncidentsPage() {
  return <IncidentList />;
}
