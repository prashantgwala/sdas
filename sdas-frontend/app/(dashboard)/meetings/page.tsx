import type { Metadata } from "next";
import { MeetingList } from "@/components/meetings/meeting-list";

export const metadata: Metadata = { title: "Meetings & reviews" };

export default function MeetingsPage() {
  return <MeetingList />;
}
