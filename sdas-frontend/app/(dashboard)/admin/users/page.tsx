import type { Metadata } from "next";
import { UserList } from "@/components/admin/user-list";

export const metadata: Metadata = { title: "All users" };

export default function AdminUsersPage() {
  return <UserList />;
}
