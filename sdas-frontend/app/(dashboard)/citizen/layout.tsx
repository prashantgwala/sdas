import type { ReactNode } from "react";
import { RoleScope } from "@/components/dashboard/role-scope";

export default function Layout({ children }: { children: ReactNode }) {
  return <RoleScope allowed={["CITIZEN"]}>{children}</RoleScope>;
}
