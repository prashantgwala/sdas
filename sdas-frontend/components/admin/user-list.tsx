"use client";

import Link from "next/link";
import { UserPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { EmptyState, PageHeader, StatusBadge, Table, TableLink, TableWrap, Td, Th } from "@/components/dashboard/ui";
import { FilterSelect, Pagination, SearchField } from "@/components/dashboard/list-controls";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import { ROLE_LABELS, type ApiMeta, type IdRef, type ReferenceCatalogs, type Role } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

export interface AdminUser {
  _id: string;
  name: string;
  email: string;
  mobile: string;
  role: Role;
  department?: IdRef | null;
  office?: { _id?: string; name?: string; code?: string } | null;
  tehsil?: IdRef | null;
  designation?: string | null;
  status: string;
  lastLoginAt?: string | null;
  createdAt?: string;
  citizenProfile?: { address?: string; tehsil?: string; language?: string };
}

const ROLES: Array<{ value: string; label: string }> = Object.entries(ROLE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const STATUSES = ["ACTIVE", "INACTIVE", "SUSPENDED", "PENDING_VERIFICATION"].map((status) => ({
  value: status,
  label: status
    .toLowerCase()
    .split("_")
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" "),
}));

export function UserList() {
  const { permissions } = useAuth();
  const [items, setItems] = useState<AdminUser[]>([]);
  const [meta, setMeta] = useState<ApiMeta>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [catalogs, setCatalogs] = useState<ReferenceCatalogs | null>(null);
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [department, setDepartment] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAppliedQ(q);
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    api
      .get<ReferenceCatalogs>("/reference/catalogs")
      .then(setCatalogs)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), limit: "15" });
    if (appliedQ) params.set("q", appliedQ);
    if (role) params.set("role", role);
    if (status) params.set("status", status);
    if (department) params.set("department", department);

    setLoading(true);
    setError("");
    api
      .list<AdminUser>(`/admin/users?${params.toString()}`, { signal: controller.signal })
      .then((result) => {
        setItems(result.items);
        setMeta(result.meta);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(errorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [page, appliedQ, role, status, department]);

  const departmentOptions = useMemo(
    () => (catalogs?.departments ?? []).map((item) => ({ value: item._id, label: item.name })),
    [catalogs],
  );

  return (
    <div>
      <PageHeader
        title="All users"
        description="Citizen accounts and district staff. Roles and data scope are enforced on every API request."
        eyebrow="Access control"
        actions={
          permissions.includes("user.create") ? (
            <Link href="/admin/users/new" className={buttonVariants({ size: "sm" })}>
              <UserPlus className="size-3.5" aria-hidden />
              Create user
            </Link>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchField value={q} onChange={setQ} placeholder="Search name, email or mobile" className="w-full sm:w-72" />
        <FilterSelect
          label="Role"
          value={role}
          placeholder="All roles"
          options={ROLES}
          onChange={(value) => {
            setRole(value);
            setPage(1);
          }}
        />
        <FilterSelect
          label="Status"
          value={status}
          placeholder="All statuses"
          options={STATUSES}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        />
        <FilterSelect
          label="Department"
          value={department}
          placeholder="All departments"
          options={departmentOptions}
          onChange={(value) => {
            setDepartment(value);
            setPage(1);
          }}
        />
      </div>

      {error ? (
        <div className="mb-4">
          <Alert variant="error">{error}</Alert>
        </div>
      ) : null}

      <div className="card-surface p-4 sm:p-5">
        {loading ? (
          <LoadingBlock label="Loading users…" />
        ) : items.length === 0 ? (
          <EmptyState
            title={appliedQ || role || status || department ? "No users match these filters" : "No users yet"}
            description="Create the first staff account or wait for citizens to register."
          />
        ) : (
          <>
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>User</Th>
                    <Th>Role</Th>
                    <Th>Department</Th>
                    <Th>Status</Th>
                    <Th>Last sign-in</Th>
                    <Th className="text-right">Action</Th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((user) => (
                    <tr key={user._id} className="group">
                      <Td>
                        <div className="max-w-[240px]">
                          <Link href={`/admin/users/${user._id}`} className="line-clamp-1 font-semibold text-foreground group-hover:text-primary">
                            {user.name}
                          </Link>
                          <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground">{user.email}</p>
                        </div>
                      </Td>
                      <Td>
                        <span className="text-[11.5px] font-medium text-foreground">{ROLE_LABELS[user.role]}</span>
                        {user.designation ? (
                          <p className="truncate text-[10px] text-muted-foreground">{user.designation}</p>
                        ) : null}
                      </Td>
                      <Td>
                        <span className="text-muted-foreground">{user.department?.name ?? "—"}</span>
                      </Td>
                      <Td>
                        <StatusBadge status={user.status} />
                      </Td>
                      <Td>
                        <span className="whitespace-nowrap text-[11px] text-muted-foreground">
                          {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "Never"}
                        </span>
                      </Td>
                      <Td className="text-right">
                        <TableLink href={`/admin/users/${user._id}`}>Manage</TableLink>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
            <div className="mt-4">
              <Pagination meta={meta} onPage={setPage} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
