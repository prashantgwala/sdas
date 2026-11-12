import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { Types } from "mongoose";
import { connectDB, disconnectDB } from "./config/db";
import { env } from "./config/env";
import { logger } from "./config/logger";
import type { Role } from "./config/constants";
import { User } from "./models/user";
import { AdministrativeUnit, Department, Office } from "./models/org";
import {
  Grievance,
  GrievanceAction,
  GrievanceCategory,
  TimelineEvent,
} from "./models/grievance";
import { Application, ApplicationType } from "./models/application";
import {
  DigitalFile,
  Document as DocumentModel,
  FileCategory,
  FileMovement,
} from "./models/file";
import { Meeting, MeetingTask } from "./models/meeting";
import { Incident, WeatherAlert } from "./models/disaster";
import { RoadDamageReport } from "./models/infrastructure";
import { Feedback } from "./models/feedback";
import { Notification } from "./models/notification";
import {
  AuditLog,
  ChatConversation,
  HelpdeskTicket,
  JobRun,
} from "./models/platform";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const now = Date.now();

function daysFromNow(value: number): Date {
  return new Date(now + value * DAY);
}

function hoursFromNow(value: number): Date {
  return new Date(now + value * HOUR);
}

function objectId(value: string): Types.ObjectId {
  return new Types.ObjectId(value);
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function upsertDoc(
  model: any,
  filter: Record<string, unknown>,
  doc: Record<string, unknown>,
  createdAt?: Date,
): Promise<any> {
  const record = await model
    .findOneAndUpdate(filter, { $set: doc }, { upsert: true, new: true, setDefaultsOnInsert: true })
    .lean();
  if (createdAt && record?._id) {
    await model.collection.updateOne(
      { _id: record._id },
      { $set: { createdAt, updatedAt: createdAt } },
    );
  }
  return record;
}

interface DemoUser {
  key: string;
  name: string;
  email: string;
  mobile: string;
  password: string;
  role: Role;
  designation: string;
  department?: Types.ObjectId;
  office?: Types.ObjectId;
}

function userSeed(
  name: string,
  email: string,
  mobile: string,
  password: string,
  role: Role,
  designation: string,
): Omit<DemoUser, "department" | "office"> {
  return { key: role.toLowerCase(), name, email, mobile, password, role, designation };
}

async function seedUsers(
  departmentId: Types.ObjectId | null,
  officeId: Types.ObjectId | null,
): Promise<Map<string, any>> {
  const seeds: DemoUser[] = [
    {
      ...userSeed(
        "Amit Kumar",
        "citizen@sdas.local",
        "9111100001",
        "Citizen@12345",
        "CITIZEN",
        "Citizen",
      ),
    },
    {
      ...userSeed(
        "Priya Sharma",
        "clerk@sdas.local",
        "9111100002",
        "Clerk@12345",
        "CLERK",
        "Head Clerk",
      ),
      department: departmentId ?? undefined,
      office: officeId ?? undefined,
    },
    {
      ...userSeed(
        "Rajesh Verma",
        "officer@sdas.local",
        "9111100003",
        "Officer@12345",
        "OFFICER",
        "Municipal Engineer",
      ),
      department: departmentId ?? undefined,
      office: officeId ?? undefined,
    },
    {
      ...userSeed(
        "Sunita Rao",
        "head@sdas.local",
        "9111100004",
        "Head@12345",
        "DEPARTMENT_HEAD",
        "Municipal Commissioner",
      ),
      department: departmentId ?? undefined,
      office: officeId ?? undefined,
    },
    {
      ...userSeed(
        "Vikram Singh",
        "district@sdas.local",
        "9111100005",
        "District@12345",
        "DISTRICT_ADMIN",
        "District Collector",
      ),
    },
    {
      ...userSeed(
        "System Administrator",
        "admin@sdas.local",
        "9111100006",
        "Admin@12345",
        "SUPER_ADMIN",
        "System Administrator",
      ),
    },
  ];

  const users = new Map<string, any>();
  for (const seed of seeds) {
    const passwordHash = await bcrypt.hash(seed.password, 12);
    const user = await User.findOneAndUpdate(
      { email: seed.email },
      {
        $set: {
          name: seed.name,
          email: seed.email,
          mobile: seed.mobile,
          passwordHash,
          role: seed.role,
          department: seed.department ?? null,
          office: seed.office ?? null,
          designation: seed.designation,
          status: "ACTIVE",
          failedLoginCount: 0,
          lockedUntil: null,
          passwordChangedAt: new Date(),
          citizenProfile:
            seed.role === "CITIZEN"
              ? {
                  address: "12 Civil Lines, Near City Park",
                  tehsil: env.DISTRICT_NAME,
                  language: "en",
                }
              : undefined,
          preferences: { theme: "light", layout: "comfortable", sidebarCollapsed: false, language: "en" },
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
    users.set(seed.role, user);
  }

  const byEmail = new Map<string, any>();
  for (const seed of seeds) byEmail.set(seed.email, users.get(seed.role));
  return byEmail;
}

interface Catalog {
  munDepartmentId: string;
  officeId: string;
  unitId: string;
  categories: Map<string, any>;
  applicationTypes: Map<string, any>;
  fileCategoryId: string;
}

async function loadCatalog(): Promise<Catalog> {
  const department = await Department.findOne({ code: "MUN" }).lean();
  if (!department) {
    throw new Error("Base seed missing: run `npm run seed` before `npm run seed:demo`");
  }
  const office = await Office.findOne({ code: "MUN-HQ" }).lean();
  const unit = await AdministrativeUnit.findOne({ code: "HQ" }).lean();
  const categories = await GrievanceCategory.find({}).lean();
  const applicationTypes = await ApplicationType.find({}).lean();
  const fileCategory = await FileCategory.findOne({ code: "GEN" }).lean();

  return {
    munDepartmentId: String(department._id),
    officeId: office ? String(office._id) : "",
    unitId: unit ? String(unit._id) : "",
    categories: new Map(categories.map((item) => [item.code, item])),
    applicationTypes: new Map(applicationTypes.map((item) => [item.code, item])),
    fileCategoryId: fileCategory ? String(fileCategory._id) : "",
  };
}

interface GrievanceSeed {
  id: string;
  subject: string;
  description: string;
  category: string;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  status: string;
  department: "MUN" | "ELEC" | "WRD" | "EDU" | "FCS" | "HLT";
  createdDaysAgo: number;
  slaStatus: "WITHIN_TIME" | "DUE_SOON" | "OVERDUE" | "COMPLETED";
  dueInHours?: number;
  officer?: boolean;
  assign?: boolean;
  verify?: boolean;
  resolvedDaysAgo?: number;
  closedDaysAgo?: number;
  reopen?: boolean;
  rejected?: boolean;
}

const GRIEVANCES: GrievanceSeed[] = [
  {
    id: "GRV-DEMO-0001",
    subject: "Garbage not collected from Sector 12 market",
    description:
      "Garbage has not been collected from Sector 12 market for the last four days. Waste is piling up near the shops and creating a foul smell.",
    category: "SANITATION",
    priority: "HIGH",
    status: "UNDER_INVESTIGATION",
    department: "MUN",
    createdDaysAgo: 4,
    slaStatus: "DUE_SOON",
    dueInHours: 20,
    officer: true,
    assign: true,
    verify: true,
  },
  {
    id: "GRV-DEMO-0002",
    subject: "Overflowing community dustbin near City Park",
    description:
      "The community dustbin near City Park is overflowing and waste is spreading on the footpath. Residents are facing difficulty walking past it.",
    category: "SANITATION",
    priority: "NORMAL",
    status: "ASSIGNED",
    department: "MUN",
    createdDaysAgo: 3,
    slaStatus: "WITHIN_TIME",
    dueInHours: 48,
    officer: true,
    assign: true,
    verify: true,
  },
  {
    id: "GRV-DEMO-0003",
    subject: "Illegal dumping near Sector 5 drain",
    description:
      "Unidentified persons are dumping construction waste near the Sector 5 drain at night. The drain is getting blocked before the monsoon.",
    category: "SANITATION",
    priority: "NORMAL",
    status: "SUBMITTED",
    department: "MUN",
    createdDaysAgo: 1,
    slaStatus: "WITHIN_TIME",
    dueInHours: 72,
  },
  {
    id: "GRV-DEMO-0004",
    subject: "Street cleaning staff absent in Ward 8",
    description:
      "Sweeping staff has not reported in Ward 8 for the past one week. Roads and lanes are covered with litter and leaves.",
    category: "SANITATION",
    priority: "LOW",
    status: "UNDER_VERIFICATION",
    department: "MUN",
    createdDaysAgo: 2,
    slaStatus: "WITHIN_TIME",
    dueInHours: 240,
    verify: true,
  },
  {
    id: "GRV-DEMO-0005",
    subject: "Dead animal carcass not removed from roadside",
    description:
      "A dead animal carcass is lying on the roadside near the vegetable market since yesterday. It is a serious health hazard for nearby shops.",
    category: "SANITATION",
    priority: "URGENT",
    status: "ACTION_TAKEN",
    department: "MUN",
    createdDaysAgo: 5,
    slaStatus: "OVERDUE",
    dueInHours: -24,
    officer: true,
    assign: true,
    verify: true,
  },
  {
    id: "GRV-DEMO-0006",
    subject: "Public toilet damaged at bus stand",
    description:
      "The public toilet at the main bus stand has broken doors and no water supply. It is unusable for daily commuters.",
    category: "SANITATION",
    priority: "HIGH",
    status: "PENDING_APPROVAL",
    department: "MUN",
    createdDaysAgo: 6,
    slaStatus: "DUE_SOON",
    dueInHours: 6,
    officer: true,
    assign: true,
    verify: true,
  },
  {
    id: "GRV-DEMO-0007",
    subject: "Garbage truck leaking waste water",
    description:
      "The garbage collection truck is leaking waste water on the road, spreading a bad smell through the entire locality.",
    category: "SANITATION",
    priority: "NORMAL",
    status: "RESOLVED",
    department: "MUN",
    createdDaysAgo: 9,
    slaStatus: "COMPLETED",
    officer: true,
    assign: true,
    verify: true,
    resolvedDaysAgo: 2,
  },
  {
    id: "GRV-DEMO-0008",
    subject: "Open drain causing mosquito breeding",
    description:
      "An open drain near the community centre has stagnant water and is breeding mosquitoes. Dengue cases are increasing in the area.",
    category: "SANITATION",
    priority: "HIGH",
    status: "RESOLVED",
    department: "MUN",
    createdDaysAgo: 12,
    slaStatus: "COMPLETED",
    officer: true,
    assign: true,
    verify: true,
    resolvedDaysAgo: 1,
  },
  {
    id: "GRV-DEMO-0009",
    subject: "Illegal hoarding on municipal land",
    description:
      "An unauthorised advertisement hoarding has been installed on municipal land near the main crossing without any permission.",
    category: "SANITATION",
    priority: "LOW",
    status: "CLOSED",
    department: "MUN",
    createdDaysAgo: 15,
    slaStatus: "COMPLETED",
    verify: true,
    closedDaysAgo: 10,
  },
  {
    id: "GRV-DEMO-0010",
    subject: "Sweeping contract worker payment issue",
    description:
      "Sanitation contract workers in Ward 4 have not received their salary for two months. Frequent protests are disrupting cleaning work.",
    category: "SANITATION",
    priority: "NORMAL",
    status: "REOPENED",
    department: "MUN",
    createdDaysAgo: 8,
    slaStatus: "OVERDUE",
    dueInHours: -48,
    officer: true,
    assign: true,
    verify: true,
    reopen: true,
  },
  {
    id: "GRV-DEMO-0011",
    subject: "Waste segregation bins missing in Sector 3",
    description:
      "Separate green and blue bins were promised for every household in Sector 3 but have not been delivered to most houses.",
    category: "SANITATION",
    priority: "LOW",
    status: "REJECTED",
    department: "MUN",
    createdDaysAgo: 7,
    slaStatus: "COMPLETED",
    rejected: true,
  },
  {
    id: "GRV-DEMO-0012",
    subject: "Bulk waste pickup request for housing society",
    description:
      "A housing society in Sector 7 needs a bulk waste pickup after renovation work. Requesting a scheduled collection vehicle.",
    category: "SANITATION",
    priority: "NORMAL",
    status: "RECEIVED",
    department: "MUN",
    createdDaysAgo: 0,
    slaStatus: "WITHIN_TIME",
    dueInHours: 72,
  },
  {
    id: "GRV-DEMO-0013",
    subject: "Frequent power cuts in Civil Lines",
    description:
      "Civil Lines area is facing power cuts several times a day for the last one week. Electrical appliances have been damaged.",
    category: "POWER",
    priority: "HIGH",
    status: "ASSIGNED",
    department: "ELEC",
    createdDaysAgo: 2,
    slaStatus: "DUE_SOON",
    dueInHours: 18,
    verify: true,
  },
  {
    id: "GRV-DEMO-0014",
    subject: "Low water pressure in Sector 9",
    description:
      "Water supply pressure has dropped drastically in Sector 9. Upper floor residents are not receiving water at all.",
    category: "WATER",
    priority: "NORMAL",
    status: "ACTION_TAKEN",
    department: "WRD",
    createdDaysAgo: 4,
    slaStatus: "OVERDUE",
    dueInHours: -12,
    verify: true,
  },
  {
    id: "GRV-DEMO-0015",
    subject: "School roof leaking during rain",
    description:
      "The roof of the government primary school in Ward 6 leaks heavily during rain, making classrooms unsafe for children.",
    category: "EDUCATION",
    priority: "HIGH",
    status: "UNDER_INVESTIGATION",
    department: "EDU",
    createdDaysAgo: 3,
    slaStatus: "WITHIN_TIME",
    dueInHours: 50,
    verify: true,
  },
  {
    id: "GRV-DEMO-0016",
    subject: "Ration shop not opening on time",
    description:
      "The fair price shop in Sector 2 opens late and closes early. Beneficiaries are unable to collect their monthly ration.",
    category: "RATION",
    priority: "NORMAL",
    status: "RESOLVED",
    department: "FCS",
    createdDaysAgo: 10,
    slaStatus: "COMPLETED",
    verify: true,
    resolvedDaysAgo: 3,
  },
  {
    id: "GRV-DEMO-0017",
    subject: "Streetlight outage on Ring Road",
    description:
      "Several streetlights on Ring Road are not working since the last storm. The stretch is completely dark at night.",
    category: "POWER",
    priority: "NORMAL",
    status: "SUBMITTED",
    department: "ELEC",
    createdDaysAgo: 1,
    slaStatus: "WITHIN_TIME",
    dueInHours: 96,
  },
  {
    id: "GRV-DEMO-0018",
    subject: "Hospital ambulance delay",
    description:
      "The ambulance service at the district hospital took more than an hour to reach a critical patient in Sector 11.",
    category: "HEALTH",
    priority: "URGENT",
    status: "UNDER_VERIFICATION",
    department: "HLT",
    createdDaysAgo: 1,
    slaStatus: "WITHIN_TIME",
    dueInHours: 24,
    verify: true,
  },
];

async function seedGrievances(
  userByEmail: Map<string, any>,
  catalog: Catalog,
): Promise<Map<string, any>> {
  const citizen = userByEmail.get("citizen@sdas.local");
  const clerk = userByEmail.get("clerk@sdas.local");
  const officer = userByEmail.get("officer@sdas.local");
  const head = userByEmail.get("head@sdas.local");
  const departments = await Department.find({}).lean();
  const departmentByCode = new Map(departments.map((item) => [item.code, item]));
  const grievances = new Map<string, any>();

  for (const item of GRIEVANCES) {
    const category = catalog.categories.get(item.category);
    const department = departmentByCode.get(item.department);
    const createdAt = daysFromNow(-item.createdDaysAgo);
    const submittedAt = hoursFromNow(-item.createdDaysAgo * 24 + 2);
    const assignedAt = item.assign ? new Date(createdAt.getTime() + 6 * HOUR) : null;
    const dueAt =
      item.dueInHours !== undefined
        ? hoursFromNow(item.dueInHours)
        : new Date(createdAt.getTime() + 72 * HOUR);
    const resolvedAt =
      item.resolvedDaysAgo !== undefined ? daysFromNow(-item.resolvedDaysAgo) : null;
    const closedAt = item.closedDaysAgo !== undefined ? daysFromNow(-item.closedDaysAgo) : null;

    const record = await upsertDoc(
      Grievance,
      { grievanceId: item.id },
      {
        grievanceId: item.id,
        citizen: citizen._id,
        contact: {
          name: citizen.name,
          mobile: citizen.mobile,
          email: citizen.email,
        },
        subject: item.subject,
        description: item.description,
        category: category?._id ?? null,
        subcategory: null,
        location: `${item.subject.includes("Sector") ? "Sector 5" : "Civil Lines"}, ${env.DISTRICT_NAME}`,
        tehsil: catalog.unitId ? objectId(catalog.unitId) : null,
        department: department?._id ?? null,
        office: item.department === "MUN" && catalog.officeId ? objectId(catalog.officeId) : null,
        priority: item.priority,
        status: item.status,
        source: "CITIZEN",
        verifiedBy: item.verify ? clerk._id : null,
        verifiedAt: item.verify ? new Date(createdAt.getTime() + 3 * HOUR) : null,
        routedBy: item.verify ? clerk._id : null,
        routedAt: item.verify ? new Date(createdAt.getTime() + 4 * HOUR) : null,
        attachments: [],
        aiSuggestion: {
          category: category?._id ?? null,
          subcategory: null,
          department: department?._id ?? null,
          confidence: 0.82,
          status: "ACCEPTED",
          rationale: "Matched keywords and department routing rules.",
          reviewedBy: clerk._id,
          reviewedAt: new Date(createdAt.getTime() + 3 * HOUR),
        },
        assignedOfficer: item.officer ? officer._id : null,
        assignedBy: item.officer ? head._id : null,
        assignedAt,
        acknowledgedAt: item.officer ? new Date(createdAt.getTime() + 8 * HOUR) : null,
        resolvedAt,
        closedAt,
        resolution:
          resolvedAt || closedAt
            ? {
                text: "Field team inspected the site and completed the corrective action. Photographic evidence recorded in the file.",
                documents: [],
                submittedBy: officer._id,
                submittedAt: resolvedAt ?? closedAt,
              }
            : { text: "", documents: [], submittedBy: null, submittedAt: null },
        decision: item.rejected
          ? {
              outcome: "REJECTED",
              reason: "The claim could not be substantiated after field verification.",
              decidedBy: head._id,
              decidedAt: daysFromNow(-4),
            }
          : null,
        reopenRequest: item.reopen
          ? {
              reason: "The issue reoccurred within a week of the earlier action.",
              status: "APPROVED",
              requestedAt: daysFromNow(-3),
              reviewedBy: head._id,
              reviewedAt: daysFromNow(-2),
              decisionNotes: "Reopened and assigned for fresh field action.",
            }
          : { status: "NONE" },
        feedbackSubmitted: false,
        sla: {
          assignedAt,
          acknowledgedAt: item.officer ? new Date(createdAt.getTime() + 8 * HOUR) : null,
          dueAt,
          completedAt: item.slaStatus === "COMPLETED" ? resolvedAt ?? closedAt : null,
          status: item.slaStatus,
          escalationLevel: item.slaStatus === "OVERDUE" ? 1 : 0,
          escalatedAt: item.slaStatus === "OVERDUE" ? daysFromNow(-1) : null,
        },
        submittedAt,
        createdBy: citizen._id,
      },
      createdAt,
    );
    grievances.set(item.id, record);
  }

  const timelineFor: Array<{
    id: string;
    action: string;
    fromStatus?: string;
    toStatus?: string;
    message: string;
    visibility: "PUBLIC" | "INTERNAL";
    actor: any;
    daysAgo: number;
  }> = [
    {
      id: "GRV-DEMO-0001",
      action: "SUBMITTED",
      toStatus: "SUBMITTED",
      message: "Grievance submitted by the citizen.",
      visibility: "PUBLIC",
      actor: citizen,
      daysAgo: 4,
    },
    {
      id: "GRV-DEMO-0001",
      action: "VERIFIED",
      fromStatus: "SUBMITTED",
      toStatus: "UNDER_VERIFICATION",
      message: "Grievance verified by the registration clerk.",
      visibility: "PUBLIC",
      actor: clerk,
      daysAgo: 3,
    },
    {
      id: "GRV-DEMO-0001",
      action: "ASSIGNED",
      fromStatus: "UNDER_VERIFICATION",
      toStatus: "UNDER_INVESTIGATION",
      message: "Assigned to the municipal engineer for field investigation.",
      visibility: "PUBLIC",
      actor: head,
      daysAgo: 3,
    },
    {
      id: "GRV-DEMO-0001",
      action: "SITE_VISIT",
      message: "Field inspection completed, garbage pickup rescheduled.",
      visibility: "INTERNAL",
      actor: officer,
      daysAgo: 1,
    },
    {
      id: "GRV-DEMO-0005",
      action: "SUBMITTED",
      toStatus: "SUBMITTED",
      message: "Grievance submitted by the citizen.",
      visibility: "PUBLIC",
      actor: citizen,
      daysAgo: 5,
    },
    {
      id: "GRV-DEMO-0005",
      action: "ACTION_TAKEN",
      message: "Carcass removed and disinfection completed.",
      visibility: "PUBLIC",
      actor: officer,
      daysAgo: 1,
    },
    {
      id: "GRV-DEMO-0006",
      action: "PENDING_APPROVAL",
      message: "Repair estimate submitted for departmental approval.",
      visibility: "PUBLIC",
      actor: officer,
      daysAgo: 1,
    },
    {
      id: "GRV-DEMO-0007",
      action: "RESOLVED",
      toStatus: "RESOLVED",
      message: "Garbage truck repaired and leakage stopped.",
      visibility: "PUBLIC",
      actor: officer,
      daysAgo: 2,
    },
    {
      id: "GRV-DEMO-0010",
      action: "REOPENED",
      toStatus: "REOPENED",
      message: "Reopen request approved after the issue reoccurred.",
      visibility: "PUBLIC",
      actor: head,
      daysAgo: 2,
    },
  ];

  for (const event of timelineFor) {
    const grievance = grievances.get(event.id);
    if (!grievance) continue;
    const createdAt = daysFromNow(-event.daysAgo);
    await upsertDoc(
      TimelineEvent,
      { entityType: "GRIEVANCE", entityId: grievance._id, action: event.action, message: event.message },
      {
        entityType: "GRIEVANCE",
        entityId: grievance._id,
        action: event.action,
        fromStatus: event.fromStatus ?? null,
        toStatus: event.toStatus ?? null,
        actor: event.actor._id,
        visibility: event.visibility,
        message: event.message,
        metadata: { demo: true },
      },
      createdAt,
    );
  }

  const actions = [
    {
      id: "GRV-DEMO-0001",
      type: "INTERNAL_NOTE",
      text: "Supervisor instructed to deploy an additional compactor for the market area.",
      actor: officer,
      visibility: "INTERNAL",
      daysAgo: 2,
    },
    {
      id: "GRV-DEMO-0001",
      type: "EVIDENCE",
      text: "Site photographs uploaded after inspection.",
      actor: officer,
      visibility: "INTERNAL",
      daysAgo: 1,
    },
    {
      id: "GRV-DEMO-0006",
      type: "ATR",
      text: "Action taken report submitted with repair estimate and quotations.",
      actor: officer,
      visibility: "PUBLIC",
      daysAgo: 1,
    },
  ] as const;

  for (const action of actions) {
    const grievance = grievances.get(action.id);
    if (!grievance) continue;
    const createdAt = daysFromNow(-action.daysAgo);
    await upsertDoc(
      GrievanceAction,
      { grievance: grievance._id, type: action.type, text: action.text },
      {
        grievance: grievance._id,
        type: action.type,
        text: action.text,
        documents: [],
        actor: action.actor._id,
        visibility: action.visibility,
      },
      createdAt,
    );
  }

  return grievances;
}

interface ApplicationSeed {
  id: string;
  typeCode: string;
  status: string;
  priority: "LOW" | "NORMAL" | "HIGH";
  createdDaysAgo: number;
  missing?: string[];
  officer?: boolean;
  clerk?: boolean;
  decision?: "APPROVED" | "REJECTED" | "CLOSED";
}

const APPLICATIONS: ApplicationSeed[] = [
  { id: "APP-DEMO-0001", typeCode: "BLD", status: "UNDER_VERIFICATION", priority: "NORMAL", createdDaysAgo: 3, clerk: true },
  { id: "APP-DEMO-0002", typeCode: "BLD", status: "DOCUMENT_PENDING", priority: "NORMAL", createdDaysAgo: 5, clerk: true, missing: ["drawing"] },
  { id: "APP-DEMO-0003", typeCode: "BLD", status: "UNDER_REVIEW", priority: "HIGH", createdDaysAgo: 4, officer: true },
  { id: "APP-DEMO-0004", typeCode: "BLD", status: "PENDING_DECISION", priority: "NORMAL", createdDaysAgo: 6, officer: true },
  { id: "APP-DEMO-0005", typeCode: "BLD", status: "APPROVED", priority: "NORMAL", createdDaysAgo: 10, decision: "APPROVED" },
  { id: "APP-DEMO-0006", typeCode: "BLD", status: "REJECTED", priority: "LOW", createdDaysAgo: 12, decision: "REJECTED" },
  { id: "APP-DEMO-0007", typeCode: "INC", status: "UNDER_VERIFICATION", priority: "NORMAL", createdDaysAgo: 2 },
  { id: "APP-DEMO-0008", typeCode: "BRT", status: "SUBMITTED", priority: "NORMAL", createdDaysAgo: 1 },
  { id: "APP-DEMO-0009", typeCode: "RAT", status: "DOCUMENT_PENDING", priority: "HIGH", createdDaysAgo: 4, missing: ["identity"] },
  { id: "APP-DEMO-0010", typeCode: "WTC", status: "APPROVED", priority: "NORMAL", createdDaysAgo: 8, decision: "APPROVED" },
  { id: "APP-DEMO-0011", typeCode: "ELC", status: "UNDER_REVIEW", priority: "NORMAL", createdDaysAgo: 3 },
  { id: "APP-DEMO-0012", typeCode: "OAP", status: "SUBMITTED", priority: "LOW", createdDaysAgo: 0 },
];

async function seedApplications(
  userByEmail: Map<string, any>,
  catalog: Catalog,
): Promise<Map<string, any>> {
  const citizen = userByEmail.get("citizen@sdas.local");
  const clerk = userByEmail.get("clerk@sdas.local");
  const officer = userByEmail.get("officer@sdas.local");
  const head = userByEmail.get("head@sdas.local");
  const applications = new Map<string, any>();

  for (const item of APPLICATIONS) {
    const type = catalog.applicationTypes.get(item.typeCode);
    if (!type) continue;
    const createdAt = daysFromNow(-item.createdDaysAgo);
    const submittedAt = new Date(createdAt.getTime() + 3 * HOUR);
    const checklist = (type.requiredDocuments ?? []).map((doc: any) => ({
      key: doc.key,
      label: doc.label,
      required: doc.required,
      provided: !(item.missing ?? []).includes(doc.key),
      document: null,
      verified: false,
      remarks: (item.missing ?? []).includes(doc.key) ? "Document not provided" : "",
    }));
    const dueAt = new Date(createdAt.getTime() + 10 * DAY);

    const record = await upsertDoc(
      Application,
      { applicationId: item.id },
      {
        applicationId: item.id,
        type: type._id,
        citizen: citizen._id,
        formData: {
          address: "12 Civil Lines, Near City Park",
          purpose: "Official documentation",
          annualIncome: 420000,
          plotNumber: "MUN-12/7",
          plotArea: 2400,
          buildingType: "Residential",
        },
        department: type.department,
        status: item.status,
        assignedClerk: item.clerk || item.status !== "SUBMITTED" ? clerk._id : null,
        assignedOfficer: item.officer ? officer._id : null,
        reviewNotes: item.status === "UNDER_REVIEW" ? "Site verification completed, documents in order." : "",
        reviewedBy: item.officer ? officer._id : null,
        reviewedAt: item.officer ? new Date(createdAt.getTime() + 2 * DAY) : null,
        documents: [],
        checklist,
        missingDocuments: item.missing ?? [],
        priority: item.priority,
        sla: {
          assignedAt: item.status === "SUBMITTED" ? null : new Date(createdAt.getTime() + 6 * HOUR),
          dueAt,
          completedAt:
            item.decision && item.decision !== "REJECTED"
              ? daysFromNow(-Math.max(1, item.createdDaysAgo - 6))
              : null,
          status: item.decision ? "COMPLETED" : "WITHIN_TIME",
          escalationLevel: 0,
        },
        decision: item.decision
          ? {
              outcome: item.decision,
              reason:
                item.decision === "APPROVED"
                  ? "All required documents verified and site inspection satisfactory."
                  : "Application rejected due to incomplete ownership documents.",
              decidedBy: head._id,
              decidedAt: daysFromNow(-Math.max(1, item.createdDaysAgo - 5)),
            }
          : null,
        submittedAt,
      },
      createdAt,
    );
    applications.set(item.id, record);
  }

  return applications;
}

interface FileSeed {
  id: string;
  number: string;
  subject: string;
  description: string;
  status: string;
  confidentiality: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL";
  department: "MUN" | "PWD" | "ELEC";
  priority: "LOW" | "NORMAL" | "HIGH";
  custodian: "clerk" | "officer" | "head" | null;
  createdDaysAgo: number;
  dueInHours: number;
}

const FILES: FileSeed[] = [
  {
    id: "FIL-DEMO-0001",
    number: "MUN/DEMO/2026/0001",
    subject: "Annual municipal sanitation budget 2026-27",
    description: "Departmental budget proposal for sanitation services, vehicle maintenance and staff.",
    status: "APPROVAL_PENDING",
    confidentiality: "CONFIDENTIAL",
    department: "MUN",
    priority: "HIGH",
    custodian: "head",
    createdDaysAgo: 6,
    dueInHours: 30,
  },
  {
    id: "FIL-DEMO-0002",
    number: "MUN/DEMO/2026/0002",
    subject: "Ward-wise garbage collection route plan",
    description: "Revised route plan for door-to-door garbage collection across all municipal wards.",
    status: "UNDER_REVIEW",
    confidentiality: "INTERNAL",
    department: "MUN",
    priority: "NORMAL",
    custodian: "officer",
    createdDaysAgo: 4,
    dueInHours: 60,
  },
  {
    id: "FIL-DEMO-0003",
    number: "MUN/DEMO/2026/0003",
    subject: "Tender for procurement of new compactors",
    description: "Comparative statement and tender evaluation for four new garbage compactor vehicles.",
    status: "DISPATCHED",
    confidentiality: "INTERNAL",
    department: "MUN",
    priority: "HIGH",
    custodian: "head",
    createdDaysAgo: 2,
    dueInHours: 20,
  },
  {
    id: "FIL-DEMO-0004",
    number: "MUN/DEMO/2026/0004",
    subject: "Public toilet renovation estimate",
    description: "Estimate for renovation of public toilets at the main bus stand and City Park.",
    status: "RECEIVED",
    confidentiality: "INTERNAL",
    department: "MUN",
    priority: "NORMAL",
    custodian: "officer",
    createdDaysAgo: 5,
    dueInHours: 48,
  },
  {
    id: "FIL-DEMO-0005",
    number: "MUN/DEMO/2026/0005",
    subject: "Sanitation staff attendance register",
    description: "Monthly attendance register of sanitation field staff for November.",
    status: "REGISTERED",
    confidentiality: "INTERNAL",
    department: "MUN",
    priority: "LOW",
    custodian: "clerk",
    createdDaysAgo: 1,
    dueInHours: 72,
  },
  {
    id: "FIL-DEMO-0006",
    number: "MUN/DEMO/2026/0006",
    subject: "Swachh Bharat survey report",
    description: "Citizen feedback survey report on municipal sanitation services.",
    status: "APPROVED",
    confidentiality: "INTERNAL",
    department: "MUN",
    priority: "NORMAL",
    custodian: "head",
    createdDaysAgo: 12,
    dueInHours: 0,
  },
  {
    id: "FIL-DEMO-0007",
    number: "MUN/DEMO/2026/0007",
    subject: "Complaint register - November",
    description: "Consolidated register of sanitation complaints received during November.",
    status: "COMPLETED",
    confidentiality: "INTERNAL",
    department: "MUN",
    priority: "LOW",
    custodian: "clerk",
    createdDaysAgo: 14,
    dueInHours: 0,
  },
  {
    id: "FIL-DEMO-0008",
    number: "MUN/DEMO/2026/0008",
    subject: "Legal notice on dumping site",
    description: "Legal notice regarding unauthorised dumping at the outskirts of the city.",
    status: "ARCHIVED",
    confidentiality: "CONFIDENTIAL",
    department: "MUN",
    priority: "NORMAL",
    custodian: "head",
    createdDaysAgo: 30,
    dueInHours: 0,
  },
  {
    id: "FIL-DEMO-0009",
    number: "PWD/DEMO/2026/0009",
    subject: "Ring Road resurfacing DPR",
    description: "Detailed project report for resurfacing of Ring Road from Sector 4 to Sector 12.",
    status: "UNDER_REVIEW",
    confidentiality: "INTERNAL",
    department: "PWD",
    priority: "HIGH",
    custodian: null,
    createdDaysAgo: 8,
    dueInHours: 36,
  },
  {
    id: "FIL-DEMO-0010",
    number: "ELEC/DEMO/2026/0010",
    subject: "Transformer maintenance plan",
    description: "Preventive maintenance schedule for distribution transformers across the district.",
    status: "APPROVED",
    confidentiality: "INTERNAL",
    department: "ELEC",
    priority: "NORMAL",
    custodian: null,
    createdDaysAgo: 20,
    dueInHours: 0,
  },
];

async function seedFiles(
  userByEmail: Map<string, any>,
  catalog: Catalog,
): Promise<Map<string, any>> {
  const clerk = userByEmail.get("clerk@sdas.local");
  const officer = userByEmail.get("officer@sdas.local");
  const head = userByEmail.get("head@sdas.local");
  const departments = await Department.find({}).lean();
  const departmentByCode = new Map(departments.map((item) => [item.code, item]));
  const files = new Map<string, any>();

  for (const item of FILES) {
    const createdAt = daysFromNow(-item.createdDaysAgo);
    const department = departmentByCode.get(item.department);
    const custodian =
      item.custodian === "clerk" ? clerk : item.custodian === "officer" ? officer : item.custodian === "head" ? head : null;
    const dueAt = item.dueInHours > 0 ? hoursFromNow(item.dueInHours) : new Date(createdAt.getTime() + 7 * DAY);

    const record = await upsertDoc(
      DigitalFile,
      { fileId: item.id },
      {
        fileId: item.id,
        fileNumber: item.number,
        subject: item.subject,
        description: item.description,
        department: department?._id ?? null,
        originatingOffice: catalog.officeId && item.department === "MUN" ? objectId(catalog.officeId) : null,
        createdBy: clerk._id,
        category: catalog.fileCategoryId ? objectId(catalog.fileCategoryId) : null,
        priority: item.priority,
        confidentiality: item.confidentiality,
        status: item.status,
        currentCustodian: custodian?._id ?? null,
        currentLocation: custodian ? "Municipal Headquarters" : "Central Record Room",
        qrTokenHash: sha256(item.number),
        qrGeneratedAt: new Date(createdAt.getTime() + HOUR),
        qrVersion: 1,
        attachments: [],
        sla: {
          assignedAt: new Date(createdAt.getTime() + 2 * HOUR),
          acknowledgedAt: new Date(createdAt.getTime() + 5 * HOUR),
          dueAt,
          completedAt: ["APPROVED", "COMPLETED", "ARCHIVED"].includes(item.status)
            ? daysFromNow(-1)
            : null,
          status: ["APPROVED", "COMPLETED", "ARCHIVED"].includes(item.status)
            ? "COMPLETED"
            : item.dueInHours > 0 && item.dueInHours < 24
              ? "DUE_SOON"
              : "WITHIN_TIME",
          escalationLevel: 0,
        },
        retentionDays: 3650,
        archivedAt: item.status === "ARCHIVED" ? daysFromNow(-5) : null,
        completedAt: item.status === "COMPLETED" ? daysFromNow(-2) : null,
        finalAction:
          item.status === "COMPLETED" || item.status === "APPROVED"
            ? "Approved and closed by the competent authority."
            : "",
      },
      createdAt,
    );
    files.set(item.id, record);
  }

  const movements = [
    {
      file: "FIL-DEMO-0003",
      number: "FM-DEMO-0001",
      from: clerk,
      to: head,
      action: "APPROVAL",
      remarks: "Tender file submitted for administrative approval.",
      status: "DISPATCHED",
      dispatchedDaysAgo: 1,
      received: false,
    },
    {
      file: "FIL-DEMO-0002",
      number: "FM-DEMO-0002",
      from: clerk,
      to: officer,
      action: "REVIEW",
      remarks: "Route plan forwarded for technical review.",
      status: "RECEIVED",
      dispatchedDaysAgo: 3,
      received: true,
    },
    {
      file: "FIL-DEMO-0004",
      number: "FM-DEMO-0003",
      from: officer,
      to: head,
      action: "APPROVAL",
      remarks: "Renovation estimate forwarded for approval.",
      status: "DISPATCHED",
      dispatchedDaysAgo: 2,
      received: false,
    },
    {
      file: "FIL-DEMO-0001",
      number: "FM-DEMO-0004",
      from: officer,
      to: head,
      action: "APPROVAL",
      remarks: "Budget proposal submitted for approval.",
      status: "DISPATCHED",
      dispatchedDaysAgo: 1,
      received: false,
    },
  ];

  for (const movement of movements) {
    const file = files.get(movement.file);
    if (!file) continue;
    const dispatchedAt = daysFromNow(-movement.dispatchedDaysAgo);
    await upsertDoc(
      FileMovement,
      { movementNumber: movement.number },
      {
        file: file._id,
        movementNumber: movement.number,
        fromUser: movement.from._id,
        toUser: movement.to._id,
        fromDepartment: file.department,
        toDepartment: file.department,
        dispatchedAt,
        receivedAt: movement.received ? new Date(dispatchedAt.getTime() + 3 * HOUR) : null,
        actionRequired: movement.action,
        remarks: movement.remarks,
        status: movement.status,
        receivedVia: movement.received ? "QR" : null,
        qrScanAt: movement.received ? new Date(dispatchedAt.getTime() + 3 * HOUR) : null,
      },
      dispatchedAt,
    );
  }

  return files;
}

async function seedMeetings(
  userByEmail: Map<string, any>,
  catalog: Catalog,
  grievances: Map<string, any>,
): Promise<void> {
  const clerk = userByEmail.get("clerk@sdas.local");
  const officer = userByEmail.get("officer@sdas.local");
  const head = userByEmail.get("head@sdas.local");
  const district = userByEmail.get("district@sdas.local");

  const meetings = [
    {
      id: "MTG-DEMO-0001",
      title: "Monthly sanitation review",
      agenda:
        "Review pending sanitation grievances, SLA compliance, staff attendance and route plan implementation.",
      type: "REVIEW",
      scheduledAt: daysFromNow(2),
      mode: "PHYSICAL",
      location: "Municipal Commissioner Office, Meeting Hall",
      organizer: head,
      department: catalog.munDepartmentId ? objectId(catalog.munDepartmentId) : null,
      visibility: "INTERNAL",
      participants: [
        { user: officer, role: "OFFICER", attendance: "INVITED" },
        { user: clerk, role: "CLERK", attendance: "INVITED" },
      ],
      status: "SCHEDULED",
      minutes: { content: "", status: "DRAFT" },
    },
    {
      id: "MTG-DEMO-0002",
      title: "District disaster preparedness review",
      agenda:
        "Review flood preparedness, shelter capacity, emergency teams and inter-department coordination.",
      type: "DISTRICT",
      scheduledAt: daysFromNow(4),
      mode: "HYBRID",
      location: "District Collectorate, Conference Room",
      organizer: district,
      department: null,
      visibility: "INTERNAL",
      participants: [
        { user: head, role: "DEPARTMENT_HEAD", attendance: "INVITED" },
        { user: officer, role: "OFFICER", attendance: "INVITED" },
      ],
      status: "SCHEDULED",
      minutes: { content: "", status: "DRAFT" },
    },
    {
      id: "MTG-DEMO-0003",
      title: "Public grievance redressal camp",
      agenda:
        "Open grievance redressal camp for citizens of all wards. Bring relevant documents and complaint references.",
      type: "DISTRICT",
      scheduledAt: daysFromNow(6),
      mode: "PHYSICAL",
      location: "Community Centre, Sector 5",
      organizer: district,
      department: null,
      visibility: "PUBLIC",
      participants: [{ user: head, role: "DEPARTMENT_HEAD", attendance: "INVITED" }],
      status: "SCHEDULED",
      minutes: { content: "", status: "DRAFT" },
    },
    {
      id: "MTG-DEMO-0004",
      title: "Sanitation emergency response debrief",
      agenda: "Debrief on the recent garbage collection disruption and corrective measures.",
      type: "EMERGENCY",
      scheduledAt: daysFromNow(-5),
      mode: "ONLINE",
      location: "Video conference",
      organizer: head,
      department: catalog.munDepartmentId ? objectId(catalog.munDepartmentId) : null,
      visibility: "INTERNAL",
      participants: [
        { user: officer, role: "OFFICER", attendance: "PRESENT" },
        { user: clerk, role: "CLERK", attendance: "PRESENT" },
        { user: district, role: "DISTRICT_ADMIN", attendance: "PRESENT" },
      ],
      status: "COMPLETED",
      minutes: {
        content:
          "The committee reviewed the disruption, directed additional compactors for the market area, and set a weekly monitoring schedule.",
        status: "APPROVED",
        approvedBy: head,
        approvedAt: daysFromNow(-4),
        aiSummary: "Additional compactors approved; weekly monitoring introduced.",
      },
    },
  ];

  const meetingIds = new Map<string, any>();
  for (const item of meetings) {
    const createdAt = daysFromNow(-Math.max(1, Math.round((now - item.scheduledAt.getTime()) / DAY) + 2));
    const record = await upsertDoc(
      Meeting,
      { meetingId: item.id },
      {
        meetingId: item.id,
        title: item.title,
        agenda: item.agenda,
        type: item.type,
        scheduledAt: item.scheduledAt,
        durationMinutes: 60,
        mode: item.mode,
        location: item.location,
        organizer: item.organizer._id,
        department: item.department,
        participants: item.participants.map((participant) => ({
          user: participant.user._id,
          name: participant.user.name,
          role: participant.role,
          attendance: participant.attendance,
        })),
        visibility: item.visibility,
        minutes: item.minutes,
        status: item.status,
      },
      createdAt,
    );
    meetingIds.set(item.id, record);
  }

  const tasks = [
    {
      id: "TASK-DEMO-0001",
      meeting: "MTG-DEMO-0001",
      description: "Prepare ward-wise sanitation performance report for the monthly review.",
      assignedTo: officer,
      dueDate: daysFromNow(3),
      status: "OPEN",
    },
    {
      id: "TASK-DEMO-0002",
      meeting: "MTG-DEMO-0004",
      description: "Deploy additional compactor to Sector 12 market and confirm compliance.",
      assignedTo: officer,
      dueDate: daysFromNow(-1),
      status: "IN_PROGRESS",
    },
    {
      id: "TASK-DEMO-0003",
      meeting: "MTG-DEMO-0001",
      description: "Consolidate pending grievance list for the department head.",
      assignedTo: clerk,
      dueDate: daysFromNow(2),
      status: "OPEN",
    },
    {
      id: "TASK-DEMO-0004",
      meeting: "MTG-DEMO-0002",
      description: "Submit flood shelter readiness status for municipal buildings.",
      assignedTo: head,
      dueDate: daysFromNow(5),
      status: "OPEN",
    },
    {
      id: "TASK-DEMO-0005",
      meeting: "MTG-DEMO-0004",
      description: "Share debrief action points with all ward supervisors.",
      assignedTo: clerk,
      dueDate: daysFromNow(-2),
      status: "COMPLETED",
    },
  ];

  for (const task of tasks) {
    const meeting = meetingIds.get(task.meeting);
    if (!meeting) continue;
    const createdAt = daysFromNow(-6);
    await upsertDoc(
      MeetingTask,
      { taskId: task.id },
      {
        taskId: task.id,
        meeting: meeting._id,
        description: task.description,
        assignedTo: task.assignedTo._id,
        department: catalog.munDepartmentId ? objectId(catalog.munDepartmentId) : null,
        dueDate: task.dueDate,
        status: task.status,
        completedAt: task.status === "COMPLETED" ? daysFromNow(-2) : null,
        completionEvidence: [],
        createdBy: head._id,
      },
      createdAt,
    );
  }

  const grievanceOne = grievances.get("GRV-DEMO-0001");
  if (grievanceOne) {
    await upsertDoc(
      TimelineEvent,
      { entityType: "MEETING", entityId: meetingIds.get("MTG-DEMO-0001")?._id, action: "SCHEDULED" },
      {
        entityType: "MEETING",
        entityId: meetingIds.get("MTG-DEMO-0001")?._id,
        action: "SCHEDULED",
        actor: head._id,
        visibility: "INTERNAL",
        message: "Monthly sanitation review scheduled.",
        metadata: { demo: true, grievance: String(grievanceOne._id) },
      },
      daysFromNow(-1),
    );
  }
}

async function seedDisasterData(userByEmail: Map<string, any>): Promise<void> {
  const officer = userByEmail.get("officer@sdas.local");
  const district = userByEmail.get("district@sdas.local");
  const citizen = userByEmail.get("citizen@sdas.local");

  const alert = await upsertDoc(
    WeatherAlert,
    { source: "SEED-DEMO", type: "Heavy Rainfall", area: "District-wide" },
    {
      source: "SEED-DEMO",
      type: "Heavy Rainfall",
      severity: "HIGH",
      area: "District-wide",
      validFrom: hoursFromNow(-6),
      validTo: hoursFromNow(42),
      advisory:
        "Heavy rainfall is expected over the next 48 hours. Low-lying areas may experience waterlogging. Citizens are advised to avoid flooded roads and report emergencies on the helpline.",
      status: "WARNING",
      issuedAt: hoursFromNow(-6),
      active: true,
      createdBy: district._id,
    },
    hoursFromNow(-6),
  );

  const incidents = [
    {
      id: "INC-DEMO-0001",
      type: "Flood",
      title: "Urban flooding after heavy rain in Sector 9",
      description:
        "Waterlogging reported in Sector 9 and nearby low-lying colonies after continuous rainfall. Two rescue teams requested.",
      severity: "HIGH",
      status: "ACTIVE",
      address: "Sector 9, near the main underpass",
      reportedBy: officer,
      commander: district,
      daysAgo: 1,
      teams: [
        { name: "Rapid Response Team A", contactPerson: "Rakesh Yadav", contactPhone: "9876500011", members: 12, status: "DEPLOYED" },
        { name: "Pumping Unit 2", contactPerson: "Mohan Lal", contactPhone: "9876500012", members: 6, status: "DEPLOYED" },
      ],
      resources: [
        { name: "Dewatering pumps", category: "Equipment", quantity: 6, unit: "units", available: 4, location: "Municipal depot" },
        { name: "Rescue boats", category: "Rescue", quantity: 4, unit: "boats", available: 3, location: "Fire station" },
      ],
      actions: [
        { text: "Two pumping units deployed to clear water from the underpass.", actor: officer, at: daysFromNow(-1) },
        { text: "Traffic diversions placed near Sector 9.", actor: district, at: hoursFromNow(-12) },
      ],
    },
    {
      id: "INC-DEMO-0002",
      type: "Fire",
      title: "Fire in market godown",
      description:
        "A fire broke out in a godown behind the main market. Fire tenders brought it under control; cooling operations are ongoing.",
      severity: "MEDIUM",
      status: "CONTAINED",
      address: "Main Market, behind vegetable mandi",
      reportedBy: officer,
      commander: district,
      daysAgo: 2,
      teams: [
        { name: "Fire Tender 1", contactPerson: "Suresh Kumar", contactPhone: "9876500021", members: 8, status: "RETURNED" },
      ],
      resources: [
        { name: "Fire extinguishers", category: "Equipment", quantity: 20, unit: "units", available: 12, location: "Fire station" },
      ],
      actions: [
        { text: "Fire extinguished and cooling operation started.", actor: officer, at: daysFromNow(-2) },
      ],
    },
    {
      id: "INC-DEMO-0003",
      type: "Storm",
      title: "Tree uprooted on main road",
      description:
        "A large tree was uprooted during the storm and is blocking one lane of the main road near the bus depot.",
      severity: "LOW",
      status: "REPORTED",
      address: "Main road near bus depot",
      reportedBy: citizen,
      commander: null,
      daysAgo: 0,
      teams: [],
      resources: [],
      actions: [],
    },
  ];

  for (const item of incidents) {
    const createdAt = daysFromNow(-item.daysAgo);
    await upsertDoc(
      Incident,
      { incidentId: item.id },
      {
        incidentId: item.id,
        type: item.type,
        title: item.title,
        description: item.description,
        location: { address: item.address, tehsil: null },
        severity: item.severity,
        reportedBy: item.reportedBy._id,
        reportedAt: createdAt,
        commander: item.commander?._id ?? null,
        assignedTeams: item.teams,
        resources: item.resources,
        actions: item.actions.map((action) => ({
          text: action.text,
          actor: action.actor._id,
          at: action.at,
          documents: [],
        })),
        status: item.status,
        closedAt: null,
        closureReport: "",
        weatherAlert: alert?._id ?? null,
        documents: [],
      },
      createdAt,
    );
  }
}

async function seedRoads(
  userByEmail: Map<string, any>,
  catalog: Catalog,
): Promise<void> {
  const citizen = userByEmail.get("citizen@sdas.local");
  const officer = userByEmail.get("officer@sdas.local");
  const departments = await Department.find({}).lean();
  const departmentByCode = new Map(departments.map((item) => [item.code, item]));
  const mun = departmentByCode.get("MUN");
  const pwd = departmentByCode.get("PWD");

  const reports = [
    {
      id: "ROAD-DEMO-0001",
      roadName: "MG Road, Sector 5",
      damageCategory: "Potholes",
      description:
        "Multiple deep potholes on MG Road near the market entrance are causing accidents and traffic slowdowns.",
      repairStatus: "IN_PROGRESS",
      assignedDepartment: mun,
      createdBy: citizen,
      daysAgo: 6,
      inspection: {
        officer: officer,
        status: "COMPLETED",
        findings: "Five potholes identified; patch repair work started.",
        verified: true,
        inspectedAt: daysFromNow(-4),
      },
      updates: [
        { text: "Repair work started with cold mix patching.", status: "IN_PROGRESS", actor: officer, daysAgo: 2 },
      ],
    },
    {
      id: "ROAD-DEMO-0002",
      roadName: "City Park service lane",
      damageCategory: "Broken footpath",
      description:
        "Footpath tiles are broken near City Park, making it difficult for senior citizens and children to walk.",
      repairStatus: "REPORTED",
      assignedDepartment: mun,
      createdBy: citizen,
      daysAgo: 2,
      inspection: { officer: null, status: "PENDING", findings: "", verified: false, inspectedAt: null },
      updates: [],
    },
    {
      id: "ROAD-DEMO-0003",
      roadName: "Bus depot approach road",
      damageCategory: "Cracked surface",
      description:
        "The approach road to the bus depot has developed long cracks after the monsoon.",
      repairStatus: "COMPLETED",
      assignedDepartment: mun,
      createdBy: officer,
      daysAgo: 15,
      inspection: {
        officer: officer,
        status: "COMPLETED",
        findings: "Cracks sealed and surface levelled.",
        verified: true,
        inspectedAt: daysFromNow(-12),
      },
      updates: [
        { text: "Surface levelling and crack sealing completed.", status: "COMPLETED", actor: officer, daysAgo: 8 },
      ],
    },
    {
      id: "ROAD-DEMO-0004",
      roadName: "Station Road",
      damageCategory: "Water logging damage",
      description:
        "Road surface has been damaged due to continuous water logging near the railway station.",
      repairStatus: "APPROVED",
      assignedDepartment: mun,
      createdBy: citizen,
      daysAgo: 9,
      inspection: {
        officer: officer,
        status: "COMPLETED",
        findings: "Repair estimate approved; work order pending.",
        verified: true,
        inspectedAt: daysFromNow(-5),
      },
      updates: [
        { text: "Repair estimate approved by the department head.", status: "APPROVED", actor: officer, daysAgo: 3 },
      ],
    },
    {
      id: "ROAD-DEMO-0005",
      roadName: "Ring Road, Sector 4",
      damageCategory: "Potholes",
      description:
        "Potholes have reappeared on Ring Road near Sector 4 junction within weeks of the last repair.",
      repairStatus: "INSPECTED",
      assignedDepartment: pwd,
      createdBy: citizen,
      daysAgo: 4,
      inspection: {
        officer: null,
        status: "COMPLETED",
        findings: "Inspection scheduled with PWD field team.",
        verified: false,
        inspectedAt: daysFromNow(-2),
      },
      updates: [],
    },
  ];

  for (const report of reports) {
    const createdAt = daysFromNow(-report.daysAgo);
    await upsertDoc(
      RoadDamageReport,
      { reportId: report.id },
      {
        reportId: report.id,
        roadName: report.roadName,
        location: { address: `${report.roadName}, ${env.DISTRICT_NAME}`, tehsil: catalog.unitId ? objectId(catalog.unitId) : null },
        documents: [],
        damageCategory: report.damageCategory,
        description: report.description,
        aiSuggestion: {
          category: report.damageCategory,
          confidence: 0.78,
          rationale: "Damage keywords and photo metadata matched the reported category.",
          status: "ACCEPTED",
          reviewedBy: officer._id,
          reviewedAt: daysFromNow(-Math.max(1, report.daysAgo - 1)),
        },
        inspection: {
          officer: report.inspection.officer?._id ?? null,
          status: report.inspection.status,
          findings: report.inspection.findings,
          verified: report.inspection.verified,
          inspectedAt: report.inspection.inspectedAt,
          documents: [],
        },
        assignedDepartment: report.assignedDepartment?._id ?? null,
        repairStatus: report.repairStatus,
        repairUpdates: report.updates.map((update) => ({
          text: update.text,
          status: update.status,
          actor: update.actor._id,
          at: daysFromNow(-update.daysAgo),
          evidence: [],
        })),
        closureEvidence: [],
        closedAt: report.repairStatus === "COMPLETED" ? daysFromNow(-8) : null,
        createdBy: report.createdBy._id,
      },
      createdAt,
    );
  }
}

async function seedFeedback(
  userByEmail: Map<string, any>,
  catalog: Catalog,
  grievances: Map<string, any>,
): Promise<void> {
  const citizen = userByEmail.get("citizen@sdas.local");
  const head = userByEmail.get("head@sdas.local");
  const departments = await Department.find({}).lean();
  const departmentByCode = new Map(departments.map((item) => [item.code, item]));

  const items = [
    {
      id: "FDB-DEMO-0001",
      category: "Grievance resolution",
      text: "The sanitation team responded quickly and cleaned the market area within two days. Thank you.",
      rating: 5,
      department: "MUN",
      status: "REVIEWED",
      topics: ["quick response", "cleanliness"],
      grievance: "GRV-DEMO-0007",
      daysAgo: 2,
    },
    {
      id: "FDB-DEMO-0002",
      category: "Staff behaviour",
      text: "The field staff was polite and explained the action taken. The issue was resolved properly.",
      rating: 4,
      department: "MUN",
      status: "REVIEWED",
      topics: ["staff behaviour", "resolution"],
      grievance: "GRV-DEMO-0008",
      daysAgo: 1,
    },
    {
      id: "FDB-DEMO-0003",
      category: "Application process",
      text: "The building permission process took longer than expected and status updates were not frequent.",
      rating: 3,
      department: "MUN",
      status: "PENDING_REVIEW",
      topics: ["delay", "communication"],
      grievance: null,
      daysAgo: 3,
    },
    {
      id: "FDB-DEMO-0004",
      category: "Portal experience",
      text: "The online complaint tracking is very useful and easy to use. Documents upload worked smoothly.",
      rating: 5,
      department: null,
      status: "PENDING_REVIEW",
      topics: ["portal", "usability"],
      grievance: null,
      daysAgo: 4,
    },
    {
      id: "FDB-DEMO-0005",
      category: "Grievance resolution",
      text: "The reopened complaint is still pending action and no officer has contacted me yet.",
      rating: 2,
      department: "MUN",
      status: "PENDING_REVIEW",
      topics: ["pending action", "follow-up"],
      grievance: "GRV-DEMO-0010",
      daysAgo: 1,
    },
  ];

  for (const item of items) {
    const createdAt = daysFromNow(-item.daysAgo);
    const grievance = item.grievance ? grievances.get(item.grievance) : null;
    await upsertDoc(
      Feedback,
      { feedbackId: item.id },
      {
        feedbackId: item.id,
        citizen: citizen._id,
        grievance: grievance?._id ?? null,
        department: item.department ? departmentByCode.get(item.department)?._id ?? null : null,
        category: item.category,
        text: item.text,
        rating: item.rating,
        status: item.status,
        aiTopics: item.topics,
        reviewedBy: item.status === "REVIEWED" ? head._id : null,
        reviewNotes: item.status === "REVIEWED" ? "Reviewed during weekly quality meeting." : "",
        reviewedAt: item.status === "REVIEWED" ? daysFromNow(-1) : null,
      },
      createdAt,
    );
  }

  const resolved = grievances.get("GRV-DEMO-0007");
  if (resolved) {
    await Grievance.updateOne({ _id: resolved._id }, { $set: { feedbackSubmitted: true } });
  }
}

async function seedHelpdesk(
  userByEmail: Map<string, any>,
  catalog: Catalog,
): Promise<void> {
  const citizen = userByEmail.get("citizen@sdas.local");
  const clerk = userByEmail.get("clerk@sdas.local");

  const tickets = [
    {
      id: "TKT-DEMO-0001",
      subject: "Unable to download acknowledgement of my application",
      category: "Portal support",
      description:
        "I submitted a building permission application but the acknowledgement PDF does not download from my dashboard.",
      priority: "HIGH",
      status: "OPEN",
      assignedTo: clerk,
      daysAgo: 1,
      messages: [
        { author: citizen, content: "The download button shows an error for my application.", internal: false, daysAgo: 1 },
        { author: clerk, content: "We are checking the document storage link and will update you shortly.", internal: false, hoursAgo: 6 },
      ],
      resolution: "",
      resolvedDaysAgo: null,
    },
    {
      id: "TKT-DEMO-0002",
      subject: "Need help tracking my reopened grievance",
      category: "Grievance support",
      description:
        "My grievance was reopened but I cannot see the current status or the assigned officer details.",
      priority: "NORMAL",
      status: "IN_PROGRESS",
      assignedTo: clerk,
      daysAgo: 2,
      messages: [
        { author: citizen, content: "Please confirm who is handling my reopened complaint.", internal: false, daysAgo: 2 },
        { author: clerk, content: "Assigned to the municipal engineer for fresh action.", internal: false, daysAgo: 1 },
        { author: clerk, content: "Internal note: verify SLA escalation flag before closing.", internal: true, hoursAgo: 8 },
      ],
      resolution: "",
      resolvedDaysAgo: null,
    },
    {
      id: "TKT-DEMO-0003",
      subject: "Question about required documents for water connection",
      category: "Application support",
      description:
        "Please confirm whether a property tax receipt is required along with the ownership proof for a water connection.",
      priority: "LOW",
      status: "RESOLVED",
      assignedTo: clerk,
      daysAgo: 6,
      messages: [
        { author: citizen, content: "Is the property tax receipt mandatory for water connection?", internal: false, daysAgo: 6 },
        { author: clerk, content: "Ownership proof is sufficient; tax receipt is optional for domestic connections.", internal: false, daysAgo: 5 },
      ],
      resolution: "Clarified the document requirements to the citizen.",
      resolvedDaysAgo: 5,
    },
  ];

  for (const ticket of tickets) {
    const createdAt = daysFromNow(-ticket.daysAgo);
    await upsertDoc(
      HelpdeskTicket,
      { ticketId: ticket.id },
      {
        ticketId: ticket.id,
        citizen: citizen._id,
        subject: ticket.subject,
        category: ticket.category,
        description: ticket.description,
        priority: ticket.priority,
        status: ticket.status,
        assignedTo: ticket.assignedTo._id,
        department: catalog.munDepartmentId ? objectId(catalog.munDepartmentId) : null,
        messages: ticket.messages.map((message) => ({
          author: message.author._id,
          authorName: message.author.name,
          content: message.content,
          internal: message.internal,
          at: message.daysAgo !== undefined ? daysFromNow(-message.daysAgo) : hoursFromNow(-(message.hoursAgo ?? 1)),
        })),
        resolution: ticket.resolution,
        resolvedAt: ticket.resolvedDaysAgo !== null ? daysFromNow(-ticket.resolvedDaysAgo) : null,
        sla: {
          dueAt: new Date(createdAt.getTime() + 2 * DAY),
          status: ticket.status === "RESOLVED" ? "COMPLETED" : "WITHIN_TIME",
          escalationLevel: 0,
        },
      },
      createdAt,
    );
  }

  await upsertDoc(
    ChatConversation,
    { user: citizen._id, status: "ACTIVE" },
    {
      user: citizen._id,
      guestId: null,
      language: "en",
      status: "ACTIVE",
      messages: [
        {
          role: "USER",
          content: "How can I track the status of my grievance?",
          language: "en",
          sources: [],
          confidence: 0,
          at: daysFromNow(-1),
        },
        {
          role: "ASSISTANT",
          content:
            "Open My Grievances from your dashboard. Each grievance shows its current status, priority and service deadline. You can also open the grievance to view the public timeline.",
          language: "en",
          sources: [],
          confidence: 0.86,
          at: daysFromNow(-1),
        },
      ],
      handoffTicket: null,
    },
    daysFromNow(-1),
  );
}

async function seedNotifications(userByEmail: Map<string, any>): Promise<void> {
  const citizen = userByEmail.get("citizen@sdas.local");
  const clerk = userByEmail.get("clerk@sdas.local");
  const officer = userByEmail.get("officer@sdas.local");
  const head = userByEmail.get("head@sdas.local");
  const district = userByEmail.get("district@sdas.local");
  const admin = userByEmail.get("admin@sdas.local");

  const items = [
    {
      user: citizen,
      type: "GRIEVANCE_STATUS_CHANGED",
      title: "Grievance GRV-DEMO-0001 updated",
      body: "Your grievance about garbage collection has been assigned to the municipal engineer.",
      link: "/citizen/grievances",
      unread: true,
      hoursAgo: 20,
    },
    {
      user: citizen,
      type: "APPLICATION_STATUS_CHANGED",
      title: "Application APP-DEMO-0002 needs documents",
      body: "The building drawing is missing from your application. Please upload it to continue processing.",
      link: "/citizen/applications",
      unread: true,
      hoursAgo: 30,
    },
    {
      user: citizen,
      type: "MEETING_SCHEDULED",
      title: "Public grievance redressal camp on " + daysFromNow(6).toDateString(),
      body: "A public grievance redressal camp is scheduled at Community Centre, Sector 5. All citizens are welcome.",
      link: "/meetings",
      unread: true,
      hoursAgo: 12,
    },
    {
      user: citizen,
      type: "SYSTEM",
      title: "Feedback request for resolved grievance",
      body: "Your grievance GRV-DEMO-0007 has been resolved. Please share your feedback.",
      link: "/citizen/grievances",
      unread: true,
      hoursAgo: 48,
    },
    {
      user: citizen,
      type: "GRIEVANCE_STATUS_CHANGED",
      title: "Grievance GRV-DEMO-0005 action taken",
      body: "Action has been recorded on your grievance. The public timeline has been updated.",
      link: "/citizen/grievances",
      unread: false,
      hoursAgo: 80,
    },
    {
      user: clerk,
      type: "TASK_DEADLINE",
      title: "Task due in 2 days",
      body: "Consolidate pending grievance list for the department head.",
      link: "/clerk",
      unread: true,
      hoursAgo: 8,
    },
    {
      user: clerk,
      type: "FILE_RECEIVED",
      title: "File MUN/DEMO/2026/0002 forwarded for review",
      body: "The ward-wise garbage collection route plan has been forwarded to the municipal engineer.",
      link: "/clerk/files",
      unread: true,
      hoursAgo: 26,
    },
    {
      user: clerk,
      type: "APPLICATION_STATUS_CHANGED",
      title: "New application received",
      body: "A new building permission application is pending verification.",
      link: "/clerk/applications",
      unread: true,
      hoursAgo: 50,
    },
    {
      user: clerk,
      type: "SYSTEM",
      title: "Department review meeting scheduled",
      body: "Monthly sanitation review is scheduled in the Municipal Commissioner Office.",
      link: "/meetings",
      unread: true,
      hoursAgo: 15,
    },
    {
      user: officer,
      type: "GRIEVANCE_ASSIGNED",
      title: "Grievance GRV-DEMO-0001 assigned to you",
      body: "Please investigate the garbage collection complaint before the service deadline.",
      link: "/officer/grievances",
      unread: true,
      hoursAgo: 18,
    },
    {
      user: officer,
      type: "TASK_DEADLINE",
      title: "Overdue task: deploy additional compactor",
      body: "The task to deploy an additional compactor at Sector 12 market is overdue.",
      link: "/tasks",
      unread: true,
      hoursAgo: 26,
    },
    {
      user: officer,
      type: "ESCALATION_ALERT",
      title: "SLA overdue on GRV-DEMO-0005",
      body: "The urgent sanitation grievance has crossed its resolution deadline.",
      link: "/officer/grievances",
      unread: true,
      hoursAgo: 30,
    },
    {
      user: officer,
      type: "FILE_RECEIVED",
      title: "File received for review",
      body: "The ward-wise garbage collection route plan is waiting for your review.",
      link: "/officer/files",
      unread: true,
      hoursAgo: 70,
    },
    {
      user: head,
      type: "FILE_APPROVAL_PENDING",
      title: "File approval pending",
      body: "Two files are pending your approval, including the sanitation budget proposal.",
      link: "/dept-head/files",
      unread: true,
      hoursAgo: 10,
    },
    {
      user: head,
      type: "GRIEVANCE_OVERDUE",
      title: "Department grievance overdue",
      body: "An urgent sanitation grievance has crossed the resolution deadline.",
      link: "/dept-head/grievances",
      unread: true,
      hoursAgo: 28,
    },
    {
      user: head,
      type: "MEETING_SCHEDULED",
      title: "Monthly sanitation review",
      body: "The monthly sanitation review is scheduled in two days.",
      link: "/meetings",
      unread: true,
      hoursAgo: 15,
    },
    {
      user: head,
      type: "SYSTEM",
      title: "Weekly department summary ready",
      body: "The weekly grievance and file performance summary is available in reports.",
      link: "/reports",
      unread: false,
      hoursAgo: 90,
    },
    {
      user: district,
      type: "ESCALATION_ALERT",
      title: "3 grievances overdue across the district",
      body: "Multiple departments have grievances beyond their service deadlines.",
      link: "/district/escalations",
      unread: true,
      hoursAgo: 6,
    },
    {
      user: district,
      type: "SYSTEM",
      title: "Weather warning: heavy rainfall",
      body: "A heavy rainfall warning is active for the next 48 hours. Review flood preparedness.",
      link: "/incidents",
      unread: true,
      hoursAgo: 5,
    },
    {
      user: district,
      type: "MEETING_SCHEDULED",
      title: "District disaster preparedness review",
      body: "The district review meeting is scheduled in four days.",
      link: "/meetings",
      unread: true,
      hoursAgo: 14,
    },
    {
      user: district,
      type: "GRIEVANCE_OVERDUE",
      title: "Escalation: sanitation grievance overdue",
      body: "The dead animal removal grievance has crossed its deadline by more than 24 hours.",
      link: "/district/escalations",
      unread: true,
      hoursAgo: 22,
    },
    {
      user: admin,
      type: "SYSTEM",
      title: "Seed data loaded",
      body: "Demo users and sample records were inserted for every role.",
      link: "/admin",
      unread: true,
      hoursAgo: 2,
    },
    {
      user: admin,
      type: "ACCOUNT_CREATED",
      title: "New accounts created",
      body: "Accounts were created for citizen, clerk, officer, department head and district admin.",
      link: "/admin/users",
      unread: true,
      hoursAgo: 3,
    },
    {
      user: admin,
      type: "ESCALATION_ALERT",
      title: "System monitoring alert",
      body: "Three grievances are overdue and require district-level attention.",
      link: "/admin/audit",
      unread: true,
      hoursAgo: 12,
    },
    {
      user: admin,
      type: "SYSTEM",
      title: "Nightly jobs completed",
      body: "SLA monitoring, notification dispatch and retention cleanup completed successfully.",
      link: "/admin/jobs",
      unread: false,
      hoursAgo: 40,
    },
  ];

  for (const item of items) {
    const dedupeKey = `demo:${item.user.email}:${item.title}`;
    const createdAt = hoursFromNow(-item.hoursAgo);
    await upsertDoc(
      Notification,
      { dedupeKey },
      {
        recipient: item.user._id,
        type: item.type,
        title: item.title,
        body: item.body,
        entityType: "SYSTEM",
        entityId: null,
        link: item.link,
        channels: ["IN_APP"],
        readAt: item.unread ? null : hoursFromNow(-Math.max(1, item.hoursAgo - 1)),
        emailStatus: "NOT_APPLICABLE",
        smsStatus: "NOT_APPLICABLE",
        dedupeKey,
        metadata: { demo: true },
      },
      createdAt,
    );
  }
}

async function seedPlatformActivity(userByEmail: Map<string, any>): Promise<void> {
  const admin = userByEmail.get("admin@sdas.local");
  const citizen = userByEmail.get("citizen@sdas.local");
  const officer = userByEmail.get("officer@sdas.local");
  const head = userByEmail.get("head@sdas.local");

  const audits = [
    { action: "AUTH_LOGIN", entityType: "User", label: "admin@sdas.local", actor: admin, role: "SUPER_ADMIN", status: "SUCCESS", daysAgo: 0 },
    { action: "USER_CREATED", entityType: "User", label: "citizen@sdas.local", actor: admin, role: "SUPER_ADMIN", status: "SUCCESS", daysAgo: 1 },
    { action: "USER_CREATED", entityType: "User", label: "officer@sdas.local", actor: admin, role: "SUPER_ADMIN", status: "SUCCESS", daysAgo: 1 },
    { action: "ROLE_UPDATED", entityType: "Role", label: "DEPARTMENT_HEAD", actor: admin, role: "SUPER_ADMIN", status: "SUCCESS", daysAgo: 2 },
    { action: "SETTINGS_UPDATED", entityType: "SystemSetting", label: "security.maxLoginAttempts", actor: admin, role: "SUPER_ADMIN", status: "SUCCESS", daysAgo: 2 },
    { action: "GRIEVANCE_ESCALATED", entityType: "Grievance", label: "GRV-DEMO-0005", actor: officer, role: "OFFICER", status: "SUCCESS", daysAgo: 1 },
    { action: "FILE_APPROVED", entityType: "DigitalFile", label: "MUN/DEMO/2026/0006", actor: head, role: "DEPARTMENT_HEAD", status: "SUCCESS", daysAgo: 3 },
    { action: "AUTH_LOGIN", entityType: "User", label: "citizen@sdas.local", actor: citizen, role: "CITIZEN", status: "FAILURE", daysAgo: 3 },
  ];

  for (const audit of audits) {
    const createdAt = daysFromNow(-audit.daysAgo);
    await upsertDoc(
      AuditLog,
      { action: audit.action, entityLabel: audit.label, requestId: "seed-demo" },
      {
        actor: audit.actor._id,
        actorRole: audit.role,
        action: audit.action,
        entityType: audit.entityType,
        entityId: null,
        entityLabel: audit.label,
        before: null,
        after: { demo: true },
        ip: "127.0.0.1",
        userAgent: "SDAS demo seed",
        requestId: "seed-demo",
        status: audit.status,
      },
      createdAt,
    );
  }

  const jobRuns = [
    {
      jobName: "sla-monitor",
      status: "SUCCESS",
      startedHoursAgo: 2,
      stats: { demo: true, scanned: 18, escalated: 3, dueSoon: 2 },
    },
    {
      jobName: "notification-dispatch",
      status: "SUCCESS",
      startedHoursAgo: 3,
      stats: { demo: true, queued: 24, sent: 24, failed: 0 },
    },
    {
      jobName: "retention-cleanup",
      status: "SUCCESS",
      startedHoursAgo: 5,
      stats: { demo: true, archived: 4, deleted: 0 },
    },
    {
      jobName: "backup",
      status: "FAILED",
      startedHoursAgo: 9,
      stats: { demo: true },
      error: "Backup destination not configured for this environment.",
    },
  ];

  for (const run of jobRuns) {
    const startedAt = hoursFromNow(-run.startedHoursAgo);
    await upsertDoc(
      JobRun,
      { jobName: run.jobName, "stats.demo": true },
      {
        jobName: run.jobName,
        startedAt,
        finishedAt: new Date(startedAt.getTime() + 4 * 60 * 1000),
        status: run.status,
        stats: run.stats,
        error: run.error ?? "",
        trigger: "SCHEDULE",
      },
      startedAt,
    );
  }
}

async function seedDocuments(
  userByEmail: Map<string, any>,
  catalog: Catalog,
  grievances: Map<string, any>,
  applications: Map<string, any>,
): Promise<void> {
  const citizen = userByEmail.get("citizen@sdas.local");
  const baseDir = path.resolve(process.cwd(), env.UPLOAD_DIR, "seed-demo");
  fs.mkdirSync(baseDir, { recursive: true });

  const documents = [
    {
      storedName: "seed-demo-identity-proof.txt",
      originalName: "identity-proof.txt",
      category: "Identity proof",
      entityType: "APPLICATION",
      entityId: applications.get("APP-DEMO-0001")?._id,
      content: "Demo identity proof for SDAS sample citizen Amit Kumar. Aadhaar reference: XXXX-XXXX-1234.",
    },
    {
      storedName: "seed-demo-address-proof.txt",
      originalName: "address-proof.txt",
      category: "Address proof",
      entityType: "APPLICATION",
      entityId: applications.get("APP-DEMO-0001")?._id,
      content: "Demo address proof: 12 Civil Lines, Near City Park, District Administration.",
    },
    {
      storedName: "seed-demo-grievance-photo.txt",
      originalName: "garbage-site-photo.txt",
      category: "Site photograph",
      entityType: "GRIEVANCE",
      entityId: grievances.get("GRV-DEMO-0001")?._id,
      content: "Demo site photograph metadata for the garbage collection grievance at Sector 12 market.",
    },
  ];

  const createdIds: any[] = [];
  for (const item of documents) {
    if (!item.entityId) continue;
    const absolutePath = path.join(baseDir, item.storedName);
    fs.writeFileSync(absolutePath, item.content, "utf8");
    const buffer = fs.readFileSync(absolutePath);
    const record = await upsertDoc(
      DocumentModel,
      { storedName: item.storedName },
      {
        originalName: item.originalName,
        storedName: item.storedName,
        storagePath: path.relative(path.resolve(process.cwd(), env.UPLOAD_DIR), absolutePath).split(path.sep).join("/"),
        mimeType: "text/plain",
        size: buffer.byteLength,
        checksum: sha256(item.content),
        category: item.category,
        confidentiality: "INTERNAL",
        entityType: item.entityType,
        entityId: item.entityId,
        uploadedBy: citizen._id,
        department: catalog.munDepartmentId ? objectId(catalog.munDepartmentId) : null,
        ocrStatus: "PENDING",
        deletedAt: null,
      },
      daysFromNow(-1),
    );
    createdIds.push(record);
  }

  const application = applications.get("APP-DEMO-0001");
  if (application && createdIds[0]) {
    await Application.updateOne(
      { _id: application._id },
      { $set: { documents: [createdIds[0]._id, createdIds[1]._id] } },
    );
  }
  const grievance = grievances.get("GRV-DEMO-0001");
  if (grievance && createdIds[2]) {
    await Grievance.updateOne(
      { _id: grievance._id },
      { $set: { attachments: [createdIds[2]._id] } },
    );
  }
}

async function printSummary(): Promise<void> {
  const accounts = [
    { role: "CITIZEN", email: "citizen@sdas.local", password: "Citizen@12345", dashboard: "/citizen" },
    { role: "CLERK", email: "clerk@sdas.local", password: "Clerk@12345", dashboard: "/clerk" },
    { role: "OFFICER", email: "officer@sdas.local", password: "Officer@12345", dashboard: "/officer" },
    { role: "DEPARTMENT_HEAD", email: "head@sdas.local", password: "Head@12345", dashboard: "/dept-head" },
    { role: "DISTRICT_ADMIN", email: "district@sdas.local", password: "District@12345", dashboard: "/district" },
    { role: "SUPER_ADMIN", email: "admin@sdas.local", password: "Admin@12345", dashboard: "/admin" },
  ];

  const counts = {
    users: await User.countDocuments({}),
    grievances: await Grievance.countDocuments({}),
    applications: await Application.countDocuments({}),
    files: await DigitalFile.countDocuments({}),
    meetings: await Meeting.countDocuments({}),
    tasks: await MeetingTask.countDocuments({}),
    incidents: await Incident.countDocuments({}),
    roadReports: await RoadDamageReport.countDocuments({}),
    feedback: await Feedback.countDocuments({}),
    helpdeskTickets: await HelpdeskTicket.countDocuments({}),
    notifications: await Notification.countDocuments({}),
    auditLogs: await AuditLog.countDocuments({}),
  };

  console.log("\n=== SDAS demo users ===");
  for (const account of accounts) {
    console.log(
      `${account.role.padEnd(16)} ${account.email.padEnd(24)} ${account.password.padEnd(16)} ${account.dashboard}`,
    );
  }
  console.log("\n=== Database totals ===");
  for (const [key, value] of Object.entries(counts)) {
    console.log(`${key.padEnd(16)} ${value}`);
  }
}

async function main(): Promise<void> {
  await connectDB();
  try {
    const catalogs = await loadCatalog();
    const departmentId = objectId(catalogs.munDepartmentId);
    const officeId = catalogs.officeId ? objectId(catalogs.officeId) : null;

    const userByEmail = await seedUsers(departmentId, officeId);
    const head = userByEmail.get("head@sdas.local");
    if (head) {
      await Department.updateOne({ _id: departmentId }, { $set: { head: head._id } });
    }

    const grievances = await seedGrievances(userByEmail, catalogs);
    const applications = await seedApplications(userByEmail, catalogs);
    await seedFiles(userByEmail, catalogs);
    await seedMeetings(userByEmail, catalogs, grievances);
    await seedDisasterData(userByEmail);
    await seedRoads(userByEmail, catalogs);
    await seedFeedback(userByEmail, catalogs, grievances);
    await seedHelpdesk(userByEmail, catalogs);
    await seedNotifications(userByEmail);
    await seedPlatformActivity(userByEmail);
    await seedDocuments(userByEmail, catalogs, grievances, applications);

    await printSummary();
    logger.info("SDAS demo seed completed");
  } finally {
    await disconnectDB();
  }
}

void main().catch((error) => {
  logger.fatal({ err: error }, "SDAS demo seed failed");
  process.exit(1);
});
