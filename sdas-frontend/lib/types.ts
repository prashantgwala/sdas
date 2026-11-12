export type Role =
  | "CITIZEN"
  | "CLERK"
  | "OFFICER"
  | "DEPARTMENT_HEAD"
  | "DISTRICT_ADMIN"
  | "SUPER_ADMIN";

export type Language = "en" | "hi" | "hinglish";

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  mobile: string;
  role: Role;
  department: string | null;
  departmentName: string | null;
  office: string | null;
  designation: string | null;
  status: string;
  preferences?: {
    theme?: "light" | "dark" | "system";
    layout?: "comfortable" | "compact";
    sidebarCollapsed?: boolean;
    language?: Language;
  };
  citizenProfile?: {
    address?: string;
    tehsil?: string;
    language?: Language;
  };
  lastLoginAt?: string | null;
  createdAt?: string;
}

export interface AuthSession {
  user: PublicUser;
  permissions: string[];
  dashboard: string;
  csrfToken?: string;
}

export interface ApiMeta {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  [key: string]: unknown;
}

export interface ApiEnvelope<T> {
  success: true;
  data: T;
  meta?: ApiMeta;
}

export interface ApiErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId?: string;
}

export const ROLE_LABELS: Record<Role, string> = {
  CITIZEN: "Citizen",
  CLERK: "Clerk",
  OFFICER: "Officer",
  DEPARTMENT_HEAD: "Department Head",
  DISTRICT_ADMIN: "District Admin",
  SUPER_ADMIN: "Super Admin",
};

export const ROLE_HOME: Record<Role, string> = {
  CITIZEN: "/citizen",
  CLERK: "/clerk",
  OFFICER: "/officer",
  DEPARTMENT_HEAD: "/dept-head",
  DISTRICT_ADMIN: "/district",
  SUPER_ADMIN: "/admin",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  CITIZEN: "Submit and track grievances, applications and documents",
  CLERK: "Register cases, verify documents and route work",
  OFFICER: "Investigate, act and resolve assigned cases",
  DEPARTMENT_HEAD: "Review, approve and monitor departmental work",
  DISTRICT_ADMIN: "Oversee departments, escalations and district performance",
  SUPER_ADMIN: "Manage users, roles, configuration and platform health",
};

/* ----------------------------- domain records ----------------------------- */

export interface IdRef {
  _id?: string;
  id?: string;
  name: string;
  code?: string;
}

export interface UserRef {
  _id?: string;
  id?: string;
  name: string;
  email?: string;
  mobile?: string;
  designation?: string | null;
  role?: Role;
}

export interface SlaInfo {
  dueAt?: string | null;
  status?: string;
  escalationLevel?: number;
  completedAt?: string | null;
}

export interface GrievanceSummary {
  _id: string;
  grievanceId?: string;
  subject: string;
  description?: string;
  status: string;
  priority: string;
  category?: IdRef | null;
  department?: IdRef | null;
  assignedOfficer?: UserRef | null;
  contact?: { name?: string; mobile?: string; email?: string } | null;
  citizen?: UserRef | null;
  sla?: SlaInfo;
  location?: string | null;
  createdAt: string;
  updatedAt?: string;
  submittedAt?: string | null;
  resolvedAt?: string | null;
  reopenRequest?: { status?: string; reason?: string; requestedAt?: string | null } | null;
  feedbackSubmitted?: boolean;
}

export interface DigitalFileSummary {
  _id: string;
  fileId?: string;
  fileNumber?: string;
  subject: string;
  description?: string;
  status: string;
  priority: string;
  confidentiality?: string;
  department?: IdRef | null;
  category?: IdRef | null;
  currentCustodian?: UserRef | null;
  currentLocation?: string | null;
  sla?: SlaInfo;
  createdAt: string;
  updatedAt?: string;
}

export interface ApplicationSummary {
  _id: string;
  applicationId?: string;
  status: string;
  priority?: string;
  type?: IdRef | null;
  department?: IdRef | null;
  applicant?: UserRef | null;
  assignedOfficer?: UserRef | null;
  formData?: Record<string, unknown>;
  duplicateWarning?: boolean;
  sla?: SlaInfo;
  createdAt: string;
  updatedAt?: string;
  submittedAt?: string | null;
}

export interface NotificationItem {
  _id: string;
  title: string;
  body?: string;
  message?: string;
  type?: string;
  category?: string;
  priority?: string;
  link?: string;
  readAt?: string | null;
  createdAt: string;
}

export interface MeetingTaskItem {
  _id: string;
  taskId?: string;
  title?: string;
  description: string;
  status: string;
  priority?: string;
  dueDate?: string | null;
  assignedTo?: UserRef | null;
  department?: IdRef | null;
  meeting?: { _id?: string; title?: string; meetingId?: string; scheduledAt?: string } | null;
  completedAt?: string | null;
  createdAt?: string;
}

export interface TimelineEventItem {
  _id: string;
  action: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  message?: string | null;
  createdAt: string;
  actor?: { name?: string; role?: string } | null;
  visibility?: string;
}

export interface NamedCount {
  label: string;
  value: number;
}

export interface TrendPoint {
  date: string;
  value: number;
}

export interface DashboardData {
  role: Role;
  generatedAt: string;
  stats: {
    totalGrievances?: number;
    openGrievances?: number;
    overdueGrievances?: number;
    dueSoonGrievances?: number;
    totalApplications?: number;
    openApplications?: number;
    totalFiles?: number;
    unread?: number;
    openTasks?: number;
    overdueTasks?: number;
    pendingApprovals?: number;
  };
  charts: {
    grievancesByStatus?: NamedCount[];
    applicationsByStatus?: NamedCount[];
    filesByStatus?: NamedCount[];
    grievanceTrend?: TrendPoint[];
    resolvedTrend?: TrendPoint[];
  };
  recent: {
    grievances?: GrievanceSummary[];
    applications?: ApplicationSummary[];
  };
  feedback?: { average?: number; count?: number };
  tasks?: MeetingTaskItem[];
  district?: {
    departments: number;
    activeStaff: number;
    activeIncidents: number;
    activeAlerts: number;
    openRoadReports: number;
    grievanceByDepartment: NamedCount[];
    applicationByDepartment: NamedCount[];
  };
  alerts?: Array<{ _id: string; title?: string; message?: string; severity?: string; validTo?: string }>;
  system?: {
    usersByRole: Array<{ _id: string; count: number }>;
    upcomingMeetings: number;
    integrations: Array<{ _id: string; key: string; name: string; category?: string; status: string; lastTestAt?: string | null; lastError?: string | null }>;
    jobRuns: Array<{ _id: string; jobName: string; status: string; startedAt: string; finishedAt?: string | null }>;
    auditRecent: Array<{ _id: string; action: string; entityType?: string; entityLabel?: string; createdAt: string }>;
  };
  officerWorkload?: Array<{ _id: string | null; count: number; user?: Array<{ name?: string }> }>;
  inbox?: Array<{ _id: string; file?: { fileId?: string; subject?: string; priority?: string }; dispatchedAt?: string }>;
}

export interface ReferenceCatalogs {
  platform?: { name: string; supportEmail: string; supportPhone: string };
  grievanceCategories: Array<{
    _id: string;
    name: string;
    code: string;
    parent?: string | null;
    defaultDepartment?: string | null;
    defaultPriority?: string;
    requiredEvidence?: string[];
  }>;
  departments: Array<{
    _id: string;
    name: string;
    code: string;
    description?: string;
    contactEmail?: string;
    contactPhone?: string;
  }>;
  administrativeUnits: Array<{ _id: string; name: string; code: string; type?: string }>;
  offices: Array<{ _id: string; name: string; code: string; department?: string; tehsil?: string | null; address?: string }>;
  fileCategories: Array<{ _id: string; name: string; code: string; defaultDepartment?: string | null; defaultConfidentiality?: string }>;
  applicationTypes: Array<{
    _id: string;
    name: string;
    code: string;
    department?: IdRef | string | null;
    description?: string;
    requiredDocuments?: Array<{ key: string; label: string; required: boolean }>;
    formFieldSchema?: { fields?: Array<Record<string, unknown>> } | Record<string, unknown>;
  }>;
}

export interface OfficerOption {
  id: string;
  name: string;
  designation: string | null;
  role: Role;
  roleLabel: string;
  department: { id: string; name: string; code?: string } | null;
}
