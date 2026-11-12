import type { Metadata } from "next";
import { TaskList } from "@/components/tasks/task-list";

export const metadata: Metadata = { title: "My tasks" };

export default function TasksPage() {
  return <TaskList />;
}
