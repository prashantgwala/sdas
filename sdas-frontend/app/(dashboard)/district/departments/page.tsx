import type { Metadata } from "next";
import { DistrictDepartmentsView } from "@/components/district/departments-view";

export const metadata: Metadata = { title: "District departments" };

export default function DistrictDepartmentsPage() {
  return <DistrictDepartmentsView />;
}
