import type { Metadata } from "next";
import { CitizenHelpdesk } from "@/components/support/citizen-helpdesk";

export const metadata: Metadata = { title: "Helpdesk" };

export default function CitizenHelpdeskPage() {
  return <CitizenHelpdesk />;
}
