import type { Metadata } from "next";
import { GrievanceCreateForm } from "@/components/grievances/grievance-create-form";

export const metadata: Metadata = { title: "Register a grievance" };

export default function ClerkNewGrievancePage() {
  return <GrievanceCreateForm backHref="/clerk/grievances" />;
}
