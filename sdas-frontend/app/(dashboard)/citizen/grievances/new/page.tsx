import type { Metadata } from "next";
import { GrievanceCreateForm } from "@/components/grievances/grievance-create-form";

export const metadata: Metadata = { title: "Submit a grievance" };

export default function CitizenNewGrievancePage() {
  return <GrievanceCreateForm backHref="/citizen/grievances" />;
}
