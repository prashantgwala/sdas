import type { Metadata } from "next";
import { ApplicationList } from "@/components/applications/application-list";

export const metadata: Metadata = { title: "Received applications" };

export default function ClerkApplicationsPage() {
  return (
    <ApplicationList
      title="Received applications"
      description="Verify documents, assign officers and process applications received by your department."
    />
  );
}
