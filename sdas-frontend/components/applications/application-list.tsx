"use client";

import Link from "next/link";
import { FilePlus2, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  EmptyState,
  PageHeader,
  StatusBadge,
  Table,
  TableLink,
  TableWrap,
  Td,
  Th,
} from "@/components/dashboard/ui";
import { FilterSelect, Pagination, SearchField } from "@/components/dashboard/list-controls";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import type { ApiMeta, ApplicationSummary, ReferenceCatalogs } from "@/lib/types";
import { cn, formatDate, relativeTime, titleCase } from "@/lib/utils";
import { APPLICATION_STATUSES, toOptions } from "@/lib/workflow";
import type { ApplicationTypeOption } from "./types";

export function ApplicationList({
  title,
  description,
  createHref,
  defaultMine = false,
  showDepartmentFilter = false,
}: {
  title: string;
  description: string;
  createHref?: string;
  defaultMine?: boolean;
  showDepartmentFilter?: boolean;
}) {
  const { permissions } = useAuth();
  const [items, setItems] = useState<ApplicationSummary[]>([]);
  const [meta, setMeta] = useState<ApiMeta>();
  const [types, setTypes] = useState<ApplicationTypeOption[]>([]);
  const [departments, setDepartments] = useState<ReferenceCatalogs["departments"]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [department, setDepartment] = useState("");
  const [mine, setMine] = useState(defaultMine);
  const [appliedQ, setAppliedQ] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAppliedQ(q);
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.get<ApplicationTypeOption[]>("/applications/types"),
      api.get<ReferenceCatalogs>("/reference/catalogs"),
    ])
      .then(([typeList, catalogs]) => {
        if (cancelled) return;
        setTypes(typeList);
        setDepartments(catalogs.departments);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), limit: "12" });
    if (appliedQ) params.set("q", appliedQ);
    if (status) params.set("status", status);
    if (type) params.set("type", type);
    if (department) params.set("department", department);
    if (mine) params.set("mine", "true");

    setLoading(true);
    setError("");
    api
      .list<ApplicationSummary>(`/applications?${params.toString()}`, { signal: controller.signal })
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
  }, [page, appliedQ, status, type, department, mine]);

  const hasFilters = Boolean(appliedQ || status || type || department || mine);
  const typeOptions = useMemo(
    () => types.map((item) => ({ value: item._id, label: item.name })),
    [types],
  );
  const departmentOptions = useMemo(
    () => departments.map((item) => ({ value: item._id, label: item.name })),
    [departments],
  );

  function reset() {
    setQ("");
    setAppliedQ("");
    setStatus("");
    setType("");
    setDepartment("");
    setMine(defaultMine);
    setPage(1);
  }

  return (
    <div>
      <PageHeader
        title={title}
        description={description}
        eyebrow="Service applications"
        actions={
          createHref && permissions.includes("application.create") ? (
            <Link href={createHref} className={buttonVariants({ size: "sm" })}>
              <FilePlus2 className="size-3.5" aria-hidden />
              New application
            </Link>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchField
          value={q}
          onChange={setQ}
          placeholder="Search application ID or applicant"
          className="w-full sm:w-72"
        />
        <FilterSelect
          label="Status"
          value={status}
          placeholder="All statuses"
          options={toOptions(APPLICATION_STATUSES)}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        />
        <FilterSelect
          label="Application type"
          value={type}
          placeholder="All types"
          options={typeOptions}
          onChange={(value) => {
            setType(value);
            setPage(1);
          }}
        />
        {showDepartmentFilter ? (
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
        ) : null}
        <button
          type="button"
          onClick={() => {
            setMine((value) => !value);
            setPage(1);
          }}
          aria-pressed={mine}
          className={cn(
            "inline-flex h-9 items-center rounded-lg border px-2.5 text-[12.5px] font-medium transition-colors",
            mine
              ? "border-primary/40 bg-primary-soft text-primary"
              : "border-input bg-surface text-muted-foreground hover:text-foreground",
          )}
        >
          Assigned to me
        </button>
        {hasFilters ? (
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcw className="size-3.5" aria-hidden />
            Reset
          </Button>
        ) : null}
      </div>

      {error ? (
        <div className="mb-4">
          <Alert variant="error">{error}</Alert>
        </div>
      ) : null}

      <div className="card-surface p-4 sm:p-5">
        {loading ? (
          <LoadingBlock label="Loading applications…" />
        ) : items.length === 0 ? (
          <EmptyState
            title={hasFilters ? "No applications match these filters" : "No applications yet"}
            description={
              hasFilters
                ? "Try clearing the filters or searching with a different keyword."
                : "Submitted service applications will appear here with their verification and decision status."
            }
            action={
              createHref && permissions.includes("application.create") ? (
                <Link href={createHref} className={buttonVariants({ size: "sm" })}>
                  <FilePlus2 className="size-3.5" aria-hidden />
                  New application
                </Link>
              ) : undefined
            }
          />
        ) : (
          <>
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Application</Th>
                    <Th>Type</Th>
                    <Th>Applicant</Th>
                    <Th>Status</Th>
                    <Th>Department</Th>
                    <Th>SLA</Th>
                    <Th>Filed</Th>
                    <Th className="text-right">Action</Th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const overdue =
                      item.sla?.dueAt &&
                      !["APPROVED", "REJECTED", "CLOSED"].includes(item.status) &&
                      new Date(item.sla.dueAt).getTime() < Date.now();
                    const applicant = item.applicant ?? (item as { citizen?: { name?: string } }).citizen;
                    return (
                      <tr key={item._id} className="group">
                        <Td>
                          <Link
                            href={`/applications/${item._id}`}
                            className="font-mono text-[11.5px] font-semibold text-primary group-hover:underline"
                          >
                            {item.applicationId ?? item._id}
                          </Link>
                          {item.duplicateWarning ? (
                            <p className="mt-0.5 text-[10px] font-semibold text-warning">Possible duplicate</p>
                          ) : null}
                        </Td>
                        <Td>
                          <div className="max-w-[190px]">
                            <p className="truncate font-medium text-foreground">{item.type?.name ?? "—"}</p>
                            <p className="text-[10.5px] text-muted-foreground">
                              {titleCase(item.status)}
                            </p>
                          </div>
                        </Td>
                        <Td>
                          <span className="text-muted-foreground">{applicant?.name ?? "—"}</span>
                        </Td>
                        <Td>
                          <StatusBadge status={item.status} />
                        </Td>
                        <Td>
                          <span className="text-muted-foreground">{item.department?.name ?? "—"}</span>
                        </Td>
                        <Td>
                          <span
                            className={cn(
                              "whitespace-nowrap text-[11.5px]",
                              overdue ? "font-semibold text-danger" : "text-muted-foreground",
                            )}
                          >
                            {item.sla?.dueAt
                              ? overdue
                                ? `Overdue ${relativeTime(item.sla.dueAt)}`
                                : `Due ${formatDate(item.sla.dueAt)}`
                              : "—"}
                          </span>
                        </Td>
                        <Td>
                          <span className="whitespace-nowrap text-muted-foreground">
                            {formatDate(item.createdAt)}
                          </span>
                        </Td>
                        <Td className="text-right">
                          <TableLink href={`/applications/${item._id}`}>View</TableLink>
                        </Td>
                      </tr>
                    );
                  })}
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
