import type { Metadata } from "next";
import { ApplicationList } from "@/components/applications/application-list";

export const metadata: Metadata = { title: "My applications" };

export default function CitizenApplicationsPage() {
  return (
    <ApplicationList
      title="My applications"
      description="Track certificate and scheme applications, document verification and decisions."
      createHref="/citizen/applications/new"
    />
  );
}
