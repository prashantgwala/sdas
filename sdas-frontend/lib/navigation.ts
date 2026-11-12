import {
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  Bell,
  BookOpenCheck,
  Bot,
  Building2,
  CalendarClock,
  ClipboardList,
  Clock3,
  CloudLightning,
  FilePlus2,
  FileSearch,
  FileText,
  FolderKanban,
  Gauge,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  MessageSquareText,
  Route,
  ScrollText,
  Settings,
  ShieldCheck,
  UserRound,
  Users,
  UserSquare2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Role } from "./types";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  permissions?: string[];
  badge?: "notifications" | "tasks";
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

export const DASHBOARD_ROLE_TITLES: Record<Role, string> = {
  CITIZEN: "Citizen Dashboard",
  CLERK: "Clerk Dashboard",
  OFFICER: "Officer Dashboard",
  DEPARTMENT_HEAD: "Department Dashboard",
  DISTRICT_ADMIN: "District Dashboard",
  SUPER_ADMIN: "System Dashboard",
};

export const NAVIGATION: Record<Role, NavGroup[]> = {
  CITIZEN: [
    {
      items: [{ label: "Dashboard", href: "/citizen", icon: LayoutDashboard, permissions: ["dashboard.self"] }],
    },
    {
      label: "Grievances",
      items: [
        { label: "My Grievances", href: "/citizen/grievances", icon: ClipboardList, permissions: ["grievance.read.own"] },
        { label: "Submit Grievance", href: "/citizen/grievances/new", icon: FilePlus2, permissions: ["grievance.create"] },
      ],
    },
    {
      label: "Applications",
      items: [
        { label: "My Applications", href: "/citizen/applications", icon: FileText, permissions: ["application.read.own"] },
        { label: "New Application", href: "/citizen/applications/new", icon: FilePlus2, permissions: ["application.create"] },
      ],
    },
    {
      label: "Records",
      items: [
        { label: "My Documents", href: "/citizen/documents", icon: FolderKanban },
        { label: "Notifications", href: "/notifications", icon: Bell, badge: "notifications" },
      ],
    },
    {
      label: "Support & services",
      items: [
        { label: "Report Road Damage", href: "/roads", icon: Route, permissions: ["road.create"] },
        { label: "Feedback", href: "/feedback", icon: MessageSquareText, permissions: ["feedback.create"] },
        { label: "AI Assistant", href: "/citizen/chatbot", icon: Bot, permissions: ["chatbot.use"] },
        { label: "Helpdesk", href: "/citizen/helpdesk", icon: LifeBuoy, permissions: ["helpdesk.read.own"] },
      ],
    },
    {
      label: "Account",
      items: [
        { label: "My Profile", href: "/profile", icon: UserRound },
        { label: "Settings", href: "/settings", icon: Settings },
      ],
    },
  ],

  CLERK: [
    {
      items: [{ label: "Dashboard", href: "/clerk", icon: LayoutDashboard, permissions: ["dashboard.self"] }],
    },
    {
      label: "Grievance Management",
      items: [
        { label: "Incoming Grievances", href: "/clerk/grievances", icon: ClipboardList, permissions: ["grievance.read.dept"] },
        { label: "New Registration", href: "/clerk/grievances/new", icon: FilePlus2, permissions: ["grievance.create"] },
      ],
    },
    {
      label: "Digital Files",
      items: [
        { label: "All Files", href: "/clerk/files", icon: FolderKanban, permissions: ["file.read.dept"] },
        { label: "Register New File", href: "/clerk/files/new", icon: FilePlus2, permissions: ["file.register"] },
      ],
    },
    {
      label: "Applications",
      items: [
        { label: "Received Applications", href: "/clerk/applications", icon: FileText, permissions: ["application.read.dept"] },
      ],
    },
    {
      label: "Work",
      items: [
        { label: "My Tasks", href: "/tasks", icon: ListChecks, badge: "tasks", permissions: ["task.read"] },
        { label: "Meetings", href: "/meetings", icon: CalendarClock, permissions: ["meeting.read"] },
        { label: "Helpdesk", href: "/helpdesk", icon: LifeBuoy, permissions: ["helpdesk.read.dept"] },
        { label: "Citizen Feedback", href: "/feedback", icon: MessageSquareText, permissions: ["feedback.read.dept"] },
        { label: "Notifications", href: "/notifications", icon: Bell, badge: "notifications", permissions: ["notification.read"] },
        { label: "Reports", href: "/reports", icon: BarChart3, permissions: ["report.read.dept"] },
      ],
    },
    {
      label: "Account",
      items: [
        { label: "My Profile", href: "/profile", icon: UserRound },
        { label: "Settings", href: "/settings", icon: Settings },
      ],
    },
  ],

  OFFICER: [
    {
      items: [{ label: "Dashboard", href: "/officer", icon: LayoutDashboard, permissions: ["dashboard.self"] }],
    },
    {
      label: "My Work",
      items: [
        { label: "Assigned Grievances", href: "/officer/grievances", icon: ClipboardList, permissions: ["grievance.read.assigned"] },
        { label: "Assigned Files", href: "/officer/files", icon: FolderKanban, permissions: ["file.read.assigned"] },
        { label: "Assigned Applications", href: "/officer/applications", icon: FileText, permissions: ["application.read.assigned"] },
        { label: "My Tasks", href: "/tasks", icon: ListChecks, badge: "tasks", permissions: ["task.read"] },
      ],
    },
    {
      label: "District services",
      items: [
        { label: "Meetings", href: "/meetings", icon: CalendarClock, permissions: ["meeting.read"] },
        { label: "Incidents", href: "/incidents", icon: AlertTriangle, permissions: ["incident.read"] },
        { label: "Road Reports", href: "/roads", icon: Route, permissions: ["road.read"] },
        { label: "Helpdesk", href: "/helpdesk", icon: LifeBuoy, permissions: ["helpdesk.read.dept"] },
      ],
    },
    {
      label: "Account",
      items: [
        { label: "Notifications", href: "/notifications", icon: Bell, badge: "notifications", permissions: ["notification.read"] },
        { label: "Reports", href: "/reports", icon: BarChart3, permissions: ["report.read.dept"] },
        { label: "My Profile", href: "/profile", icon: UserRound },
        { label: "Settings", href: "/settings", icon: Settings },
      ],
    },
  ],

  DEPARTMENT_HEAD: [
    {
      items: [{ label: "Dashboard", href: "/dept-head", icon: LayoutDashboard, permissions: ["dashboard.self"] }],
    },
    {
      label: "Department Work",
      items: [
        { label: "Department Grievances", href: "/dept-head/grievances", icon: ClipboardList, permissions: ["grievance.read.dept"] },
        { label: "SLA Monitoring", href: "/dept-head/sla", icon: Clock3, permissions: ["grievance.monitor.dept"] },
        { label: "Department Files", href: "/dept-head/files", icon: FolderKanban, permissions: ["file.read.dept"] },
        { label: "File Approvals", href: "/dept-head/files/approvals", icon: BadgeCheck, permissions: ["file.approve.dept"] },
        { label: "Department Applications", href: "/dept-head/applications", icon: FileText, permissions: ["application.read.dept"] },
      ],
    },
    {
      label: "Team",
      items: [
        { label: "Department Officers", href: "/dept-head/officers", icon: Users, permissions: ["grievance.assign"] },
        { label: "My Tasks", href: "/tasks", icon: ListChecks, badge: "tasks", permissions: ["task.read"] },
        { label: "Reports", href: "/reports", icon: BarChart3, permissions: ["report.read.dept"] },
      ],
    },
    {
      label: "Department services",
      items: [
        { label: "Meetings", href: "/meetings", icon: CalendarClock, permissions: ["meeting.read"] },
        { label: "Incidents", href: "/incidents", icon: AlertTriangle, permissions: ["incident.read"] },
        { label: "Road Reports", href: "/roads", icon: Route, permissions: ["road.read"] },
        { label: "Helpdesk", href: "/helpdesk", icon: LifeBuoy, permissions: ["helpdesk.read.dept"] },
        { label: "Citizen Feedback", href: "/feedback", icon: MessageSquareText, permissions: ["feedback.read.dept"] },
      ],
    },
    {
      label: "Account",
      items: [
        { label: "Notifications", href: "/notifications", icon: Bell, badge: "notifications", permissions: ["notification.read"] },
        { label: "My Profile", href: "/profile", icon: UserRound },
        { label: "Settings", href: "/settings", icon: Settings },
      ],
    },
  ],

  DISTRICT_ADMIN: [
    {
      items: [{ label: "Dashboard", href: "/district", icon: LayoutDashboard, permissions: ["dashboard.self"] }],
    },
    {
      label: "Monitoring",
      items: [
        { label: "All District Grievances", href: "/district/grievances", icon: ClipboardList, permissions: ["grievance.read.district"] },
        { label: "Escalation & Critical", href: "/district/escalations", icon: AlertTriangle, permissions: ["grievance.monitor.district"] },
        { label: "Approval Queue", href: "/district/approvals", icon: BadgeCheck, permissions: ["application.read.district"] },
        { label: "All District Files", href: "/district/files", icon: FolderKanban, permissions: ["file.read.district"] },
        { label: "All Applications", href: "/district/applications", icon: FileText, permissions: ["application.read.district"] },
      ],
    },
    {
      label: "District operations",
      items: [
        { label: "Meetings", href: "/meetings", icon: CalendarClock, permissions: ["meeting.read"] },
        { label: "Incidents", href: "/incidents", icon: AlertTriangle, permissions: ["incident.read"] },
        { label: "Weather Alerts", href: "/weather-alerts", icon: CloudLightning, permissions: ["weather.manage"] },
        { label: "Road Reports", href: "/roads", icon: Route, permissions: ["road.read"] },
        { label: "Helpdesk", href: "/helpdesk", icon: LifeBuoy, permissions: ["helpdesk.read.district"] },
        { label: "Citizen Feedback", href: "/feedback", icon: MessageSquareText, permissions: ["feedback.read.district"] },
      ],
    },
    {
      label: "Administration",
      items: [
        { label: "Departments", href: "/district/departments", icon: Building2 },
        { label: "My Tasks", href: "/tasks", icon: ListChecks, badge: "tasks", permissions: ["task.read"] },
        { label: "Reports & Analytics", href: "/reports", icon: BarChart3, permissions: ["report.read.district"] },
      ],
    },
    {
      label: "Account",
      items: [
        { label: "Notifications", href: "/notifications", icon: Bell, badge: "notifications", permissions: ["notification.read"] },
        { label: "My Profile", href: "/profile", icon: UserRound },
        { label: "Settings", href: "/settings", icon: Settings },
      ],
    },
  ],

  SUPER_ADMIN: [
    {
      items: [{ label: "System Dashboard", href: "/admin", icon: Gauge, permissions: ["dashboard.self"] }],
    },
    {
      label: "Access Control",
      items: [
        { label: "All Users", href: "/admin/users", icon: Users, permissions: ["user.read"] },
        { label: "Create User", href: "/admin/users/new", icon: UserSquare2, permissions: ["user.create"] },
        { label: "Roles & Permissions", href: "/admin/roles", icon: ShieldCheck, permissions: ["role.read"] },
      ],
    },
    {
      label: "Organization",
      items: [
        { label: "Departments", href: "/admin/departments", icon: Building2, permissions: ["org.manage"] },
        { label: "Grievance Configuration", href: "/admin/config/grievances", icon: BookOpenCheck, permissions: ["config.grievance"] },
        { label: "File Configuration", href: "/admin/config/files", icon: FolderKanban, permissions: ["config.file"] },
        { label: "Application Types", href: "/admin/config/applications", icon: FileSearch, permissions: ["application.config"] },
      ],
    },
    {
      label: "Operations",
      items: [
        { label: "Meetings", href: "/meetings", icon: CalendarClock, permissions: ["meeting.read"] },
        { label: "Incidents", href: "/incidents", icon: AlertTriangle, permissions: ["incident.read"] },
        { label: "Weather Alerts", href: "/weather-alerts", icon: CloudLightning, permissions: ["weather.manage"] },
        { label: "Road Reports", href: "/roads", icon: Route, permissions: ["road.read"] },
        { label: "Helpdesk", href: "/helpdesk", icon: LifeBuoy, permissions: ["helpdesk.read.district"] },
        { label: "Feedback", href: "/feedback", icon: MessageSquareText, permissions: ["feedback.read.district"] },
      ],
    },
    {
      label: "System",
      items: [
        { label: "Audit Logs", href: "/admin/audit", icon: ScrollText, permissions: ["audit.read"] },
        { label: "Job Runs", href: "/admin/jobs", icon: BadgeCheck, permissions: ["system.monitor"] },
        { label: "Integrations", href: "/admin/integrations", icon: Gauge, permissions: ["integration.manage"] },
        { label: "Settings", href: "/admin/settings", icon: Settings, permissions: ["settings.manage"] },
        { label: "Reports", href: "/reports", icon: BarChart3 },
      ],
    },
    {
      label: "Account",
      items: [
        { label: "Notifications", href: "/notifications", icon: Bell, badge: "notifications", permissions: ["notification.read"] },
        { label: "My Profile", href: "/profile", icon: UserRound },
        { label: "Preferences", href: "/settings", icon: Settings },
      ],
    },
  ],
};

export function navigationForRole(role: Role): NavGroup[] {
  return NAVIGATION[role] ?? [];
}
