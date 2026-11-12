import type { Metadata } from "next";
import { ApplicationList } from "@/components/applications/application-list";

export const metadata: Metadata = { title: "Assigned applications" };

export default function OfficerApplicationsPage() {
  return (
    <ApplicationList
      title="Assigned applications"
      description="Applications allocated to you for review and recommendation."
      defaultMine
    />
  );
}
