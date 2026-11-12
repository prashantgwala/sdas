import type { Metadata } from "next";
import { UserCreateForm } from "@/components/admin/user-create-form";

export const metadata: Metadata = { title: "Create user" };

export default function AdminUserCreatePage() {
  return <UserCreateForm />;
}
