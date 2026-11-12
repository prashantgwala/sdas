"use client";

import Link from "next/link";
import { BadgeCheck, FileCheck2, FolderKanban, Gavel } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  EmptyState,
  PageHeader,
  PriorityBadge,
  SectionCard,
  StatCard,
  Table,
  TableLink,
  TableWrap,
  Td,
  Th,
} from "@/components/dashboard/ui";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import type { ApplicationSummary, DigitalFileSummary } from "@/lib/types";
import { cn, formatDate, relativeTime } from "@/lib/utils";

function slaCell(dueAt?: string | null, terminal = false): { label: string; overdue: boolean } {
  if (!dueAt) return { label: "—", overdue: false };
  const overdue = !terminal && new Date(dueAt).getTime() < Date.now();
  return {
    label: overdue ? `Overdue ${relativeTime(dueAt)}` : `Due ${formatDate(dueAt)}`,
    overdue,
  };
}

export function ApprovalQueue() {
  const { permissions } = useAuth();
  const [applications, setApplications] = useState<ApplicationSummary[]>([]);
  const [applicationTotal, setApplicationTotal] = useState(0);
  const [files, setFiles] = useState<DigitalFileSummary[]>([]);
  const [fileTotal, setFileTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const canReadApplications = permissions.includes("application.read.district");
  const canReadFiles = permissions.includes("file.read.district") || permissions.includes("file.monitor");

  useEffect(() => {
    const controller = new AbortController();
    const requests: Array<Promise<unknown>> = [];
    if (canReadApplications) {
      requests.push(
        api
          .list<ApplicationSummary>("/applications?status=PENDING_DECISION&limit=6&sort=sla.dueAt", {
            signal: controller.signal,
          })
          .then((result) => {
            if (controller.signal.aborted) return;
            setApplications(result.items);
            setApplicationTotal(Number(result.meta?.total ?? 0));
          }),
      );
    }
    if (canReadFiles) {
      requests.push(
        api
          .list<DigitalFileSummary>("/files?status=APPROVAL_PENDING&limit=6&sort=sla.dueAt", {
            signal: controller.signal,
          })
          .then((result) => {
            if (controller.signal.aborted) return;
            setFiles(result.items);
            setFileTotal(Number(result.meta?.total ?? 0));
          }),
      );
    }

    setLoading(true);
    setError("");
    Promise.all(requests)
      .catch((cause) => {
        if (!controller.signal.aborted) setError(errorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [canReadApplications, canReadFiles]);

  return (
    <div>
      <PageHeader
        title="District approval queue"
        description="Matters requiring delegated authority at district level: service applications awaiting a decision and files pending approval in the movement chain."
        eyebrow="District administration"
        actions={
          <Link href="/district/applications" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            <Gavel className="size-3.5" aria-hidden />
            All applications
          </Link>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Pending decisions"
          value={applicationTotal}
          hint="Applications with a decision due"
          tone="warning"
          icon={Gavel}
        />
        <StatCard
          label="Files awaiting approval"
          value={fileTotal}
          hint="Files in approval stage"
          tone="primary"
          icon={FolderKanban}
        />
        <StatCard
          label="Delegated authority"
          value={canReadApplications ? "Active" : "View only"}
          hint="District-level decision rights"
          tone="info"
          icon={BadgeCheck}
        />
      </div>

      {error ? (
        <div className="mb-4">
          <Alert variant="error">{error}</Alert>
        </div>
      ) : null}

      {loading ? (
        <div className="card-surface p-5">
          <LoadingBlock label="Loading approval queue…" />
        </div>
      ) : (
        <div className="space-y-5">
          <SectionCard
            title="Applications pending decision"
            description="Approved, rejected or returned from the application view; decisions are audited."
            action={
              <Link
                href="/district/applications"
                className="text-[11.5px] font-semibold text-primary hover:underline"
              >
                Open register
              </Link>
            }
          >
            {applications.length === 0 ? (
              <EmptyState
                compact
                title="No pending decisions"
                description="Applications awaiting a district-level decision will appear here."
              />
            ) : (
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <Th>Application</Th>
                      <Th>Type</Th>
                      <Th>Applicant</Th>
                      <Th>Department</Th>
                      <Th>SLA</Th>
                      <Th>Filed</Th>
                      <Th className="text-right">Action</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {applications.map((item) => {
                      const applicant = item.applicant ?? (item as { citizen?: { name?: string } }).citizen;
                      const sla = slaCell(item.sla?.dueAt, ["APPROVED", "REJECTED", "CLOSED"].includes(item.status));
                      return (
                        <tr key={item._id} className="group">
                          <Td>
                            <Link
                              href={`/applications/${item._id}`}
                              className="font-mono text-[11.5px] font-semibold text-primary group-hover:underline"
                            >
                              {item.applicationId ?? item._id}
                            </Link>
                          </Td>
                          <Td>
                            <span className="text-muted-foreground">{item.type?.name ?? "—"}</span>
                          </Td>
                          <Td>
                            <span className="text-muted-foreground">{applicant?.name ?? "—"}</span>
                          </Td>
                          <Td>
                            <span className="text-muted-foreground">{item.department?.name ?? "—"}</span>
                          </Td>
                          <Td>
                            <span
                              className={cn(
                                "whitespace-nowrap text-[11.5px]",
                                sla.overdue ? "font-semibold text-danger" : "text-muted-foreground",
                              )}
                            >
                              {sla.label}
                            </span>
                          </Td>
                          <Td>
                            <span className="whitespace-nowrap text-muted-foreground">
                              {formatDate(item.createdAt)}
                            </span>
                          </Td>
                          <Td className="text-right">
                            <TableLink href={`/applications/${item._id}`}>Decide</TableLink>
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </SectionCard>

          <SectionCard
            title="Files awaiting approval"
            description="Files forwarded for approval, ordered by their SLA deadline."
            action={
              <Link href="/district/files" className="text-[11.5px] font-semibold text-primary hover:underline">
                Open register
              </Link>
            }
          >
            {files.length === 0 ? (
              <EmptyState
                compact
                title="No files awaiting approval"
                description="Files that enter the approval stage will be listed here for monitoring."
              />
            ) : (
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <Th>File</Th>
                      <Th>Subject</Th>
                      <Th>Department</Th>
                      <Th>Custodian</Th>
                      <Th>Priority</Th>
                      <Th>SLA</Th>
                      <Th className="text-right">Action</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {files.map((item) => {
                      const sla = slaCell(item.sla?.dueAt);
                      return (
                        <tr key={item._id} className="group">
                          <Td>
                            <Link
                              href={`/files/${item._id}`}
                              className="font-mono text-[11.5px] font-semibold text-primary group-hover:underline"
                            >
                              {item.fileNumber ?? item.fileId ?? item._id}
                            </Link>
                          </Td>
                          <Td>
                            <div className="max-w-[240px]">
                              <p className="line-clamp-1 font-medium text-foreground">{item.subject}</p>
                              <p className="text-[10.5px] text-muted-foreground">
                                {item.category?.name ?? "General"}
                              </p>
                            </div>
                          </Td>
                          <Td>
                            <span className="text-muted-foreground">{item.department?.name ?? "—"}</span>
                          </Td>
                          <Td>
                            <span className="text-muted-foreground">
                              {item.currentCustodian?.name ?? "Unassigned"}
                            </span>
                          </Td>
                          <Td>
                            <PriorityBadge priority={item.priority} />
                          </Td>
                          <Td>
                            <span
                              className={cn(
                                "whitespace-nowrap text-[11.5px]",
                                sla.overdue ? "font-semibold text-danger" : "text-muted-foreground",
                              )}
                            >
                              {sla.label}
                            </span>
                          </Td>
                          <Td className="text-right">
                            <TableLink href={`/files/${item._id}`}>Review</TableLink>
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </SectionCard>

          <SectionCard title="How delegated approval works" description="Routing and accountability">
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                {
                  title: "Department approval",
                  body: "Department heads approve or return files and application decisions within their own department.",
                },
                {
                  title: "District approval",
                  body: "District administration decides matters delegated under district authority and monitors departmental queues.",
                },
                {
                  title: "Audit trail",
                  body: "Every decision records the deciding officer, notes and timestamp in the case timeline and audit log.",
                },
              ].map((item) => (
                <div key={item.title} className="rounded-lg border border-border bg-surface-muted/40 p-3.5">
                  <p className="text-[12.5px] font-semibold text-foreground">{item.title}</p>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">{item.body}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
              <FileCheck2 className="size-3.5" aria-hidden />
              Approval actions respect your role scope and permissions; the server rejects out-of-scope decisions.
            </div>
          </SectionCard>
        </div>
      )}
    </div>
  );
}
