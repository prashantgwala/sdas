import type { Metadata } from "next";
import { GrievanceDeadlineMonitor, type DeadlineView } from "@/components/sla/grievance-deadline-monitor";

export const metadata: Metadata = { title: "Escalation & critical cases" };

const VIEWS: DeadlineView[] = [
  {
    key: "escalated",
    label: "Escalated cases",
    description: "Cases with an active escalation level",
    params: { escalated: "true" },
    tone: "danger",
  },
  {
    key: "urgent",
    label: "Urgent overdue",
    description: "Urgent priority past the deadline",
    params: { overdue: "true", priority: "URGENT" },
    tone: "danger",
  },
  {
    key: "high",
    label: "High overdue",
    description: "High priority past the deadline",
    params: { overdue: "true", priority: "HIGH" },
    tone: "warning",
  },
  {
    key: "approval",
    label: "Awaiting approval",
    description: "Resolutions pending departmental approval",
    params: { status: "PENDING_APPROVAL" },
    tone: "info",
  },
];

export default function DistrictEscalationsPage() {
  return (
    <GrievanceDeadlineMonitor
      title="Escalation & critical cases"
      description="Overdue, high-priority and escalated grievances across the district. District administration can reassign, escalate further or close cases from the case view."
      eyebrow="District monitoring"
      views={VIEWS}
      showDepartment
    />
  );
}
