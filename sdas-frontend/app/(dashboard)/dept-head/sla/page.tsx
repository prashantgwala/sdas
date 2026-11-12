import type { Metadata } from "next";
import { GrievanceDeadlineMonitor, type DeadlineView } from "@/components/sla/grievance-deadline-monitor";

export const metadata: Metadata = { title: "SLA monitoring" };

const VIEWS: DeadlineView[] = [
  {
    key: "today",
    label: "Due today",
    description: "Deadline falls within today",
    params: { due: "TODAY" },
    tone: "info",
  },
  {
    key: "soon",
    label: "Due soon",
    description: "Deadline in the next 72 hours",
    params: { due: "SOON" },
    tone: "warning",
  },
  {
    key: "overdue",
    label: "Overdue",
    description: "Deadline already crossed",
    params: { overdue: "true" },
    tone: "danger",
  },
  {
    key: "escalated",
    label: "Escalation required",
    description: "Automatic or manual escalation raised",
    params: { escalated: "true" },
    tone: "danger",
  },
];

export default function DeptHeadSlaPage() {
  return (
    <GrievanceDeadlineMonitor
      title="SLA monitoring"
      description="Every departmental grievance deadline in one view, with automatic reminders and escalation levels recorded against the case."
      eyebrow="Department oversight"
      views={VIEWS}
    />
  );
}
