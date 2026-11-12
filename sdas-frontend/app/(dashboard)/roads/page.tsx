import type { Metadata } from "next";
import { RoadList } from "@/components/roads/road-list";

export const metadata: Metadata = { title: "Road damage reports" };

export default function RoadsPage() {
  return <RoadList />;
}
