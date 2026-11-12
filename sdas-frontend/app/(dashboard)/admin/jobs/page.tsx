import type { Metadata } from "next";
import { JobRunsView } from "@/components/admin/job-runs-view";

export const metadata: Metadata = { title: "Scheduled jobs" };

export default function AdminJobsPage() {
  return <JobRunsView />;
}
