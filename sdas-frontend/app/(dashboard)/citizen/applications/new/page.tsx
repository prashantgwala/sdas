import type { Metadata } from "next";
import { ApplicationCreateForm } from "@/components/applications/application-create-form";

export const metadata: Metadata = { title: "New application" };

export default function NewApplicationPage() {
  return <ApplicationCreateForm backHref="/citizen/applications" />;
}
