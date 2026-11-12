import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { connectDB, disconnectDB } from "./config/db";
import { env } from "./config/env";
import { logger } from "./config/logger";
import {
  PERMISSIONS,
  ROLES,
  ROLE_DEFAULT_PERMISSIONS,
  ROLE_LABELS,
  type Role,
} from "./config/constants";
import {
  Permission as PermissionModel,
  Role as RoleModel,
} from "./models/rbac";
import { User } from "./models/user";
import {
  AdministrativeUnit,
  Department,
  DistrictConfig,
  Office,
} from "./models/org";
import { GrievanceCategory, RoutingRule, SLARule } from "./models/grievance";
import { FileCategory, MovementRule, RetentionRule } from "./models/file";
import { ApplicationType } from "./models/application";
import {
  Integration,
  KnowledgeArticle,
  SystemSetting,
} from "./models/platform";
import { NotificationTemplate } from "./models/notification";
import { isEmailConfigured, isSmsConfigured } from "./services/mail.service";

type SeedUpdate = Record<string, unknown>;

async function seedDoc(
  model: { updateOne: (...args: never[]) => unknown },
  filter: SeedUpdate,
  set: SeedUpdate,
  setOnInsert: SeedUpdate = {},
): Promise<void> {
  await model.updateOne(
    filter as never,
    { $set: set, $setOnInsert: setOnInsert } as never,
    { upsert: true } as never,
  );
}

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  CITIZEN:
    "Submit grievances and applications, track progress and share feedback.",
  CLERK:
    "Receive, verify and register grievances, files and applications for the assigned department.",
  OFFICER:
    "Investigate assigned grievances, act on files and submit resolutions.",
  DEPARTMENT_HEAD:
    "Supervise department workload, approve work and monitor SLA compliance.",
  DISTRICT_ADMIN:
    "District-wide operational oversight, escalations and delegated administration.",
  SUPER_ADMIN:
    "Platform administration, configuration, security and system monitoring.",
};

const DEPARTMENTS = [
  {
    code: "GA",
    name: "General Administration",
    description:
      "District coordination, establishment and general public services.",
  },
  {
    code: "REV",
    name: "Revenue",
    description: "Land records, revenue collection and certificate services.",
  },
  {
    code: "PWD",
    name: "Public Works",
    description:
      "Roads, bridges, public buildings and infrastructure maintenance.",
  },
  {
    code: "WRD",
    name: "Water Resources",
    description: "Drinking water supply, irrigation and water infrastructure.",
  },
  {
    code: "ELEC",
    name: "Electricity",
    description: "Power supply, street lighting and electrical infrastructure.",
  },
  {
    code: "HLT",
    name: "Health",
    description: "Public health facilities, hospitals and health programmes.",
  },
  {
    code: "EDU",
    name: "Education",
    description: "Schools, colleges, scholarships and education services.",
  },
  {
    code: "SWD",
    name: "Social Welfare",
    description: "Pensions, disability support and welfare schemes.",
  },
  {
    code: "FCS",
    name: "Food & Civil Supplies",
    description: "Ration cards, public distribution and civil supplies.",
  },
  {
    code: "MUN",
    name: "Municipal Services",
    description: "Sanitation, waste management and municipal civic services.",
  },
  {
    code: "TRN",
    name: "Transport",
    description: "Public transport, permits and vehicle-related services.",
  },
  {
    code: "FIN",
    name: "Finance",
    description: "Budget, accounts, audit coordination and financial records.",
  },
  {
    code: "DM",
    name: "Disaster Management",
    description:
      "Disaster preparedness, incident response and relief coordination.",
  },
] as const;

const GRIEVANCE_CATEGORIES = [
  {
    code: "ROAD",
    name: "Roads & Infrastructure",
    department: "PWD",
    priority: "NORMAL",
    keywords: ["road", "pothole", "bridge", "drain", "street", "सड़क", "गड्ढा"],
  },
  {
    code: "WATER",
    name: "Water Supply",
    department: "WRD",
    priority: "HIGH",
    keywords: ["water", "pipeline", "tap", "tank", "supply", "पानी", "जल"],
  },
  {
    code: "POWER",
    name: "Electricity",
    department: "ELEC",
    priority: "HIGH",
    keywords: [
      "electricity",
      "power",
      "outage",
      "transformer",
      "street light",
      "बिजली",
    ],
  },
  {
    code: "SANITATION",
    name: "Sanitation & Waste",
    department: "MUN",
    priority: "NORMAL",
    keywords: ["garbage", "sanitation", "waste", "toilet", "सफाई", "कचरा"],
  },
  {
    code: "HEALTH",
    name: "Health Services",
    department: "HLT",
    priority: "HIGH",
    keywords: [
      "hospital",
      "doctor",
      "ambulance",
      "medicine",
      "health",
      "अस्पताल",
      "स्वास्थ्य",
    ],
  },
  {
    code: "EDUCATION",
    name: "Education Services",
    department: "EDU",
    priority: "NORMAL",
    keywords: [
      "school",
      "teacher",
      "college",
      "scholarship",
      "education",
      "स्कूल",
      "शिक्षा",
    ],
  },
  {
    code: "REVENUE",
    name: "Revenue & Land Records",
    department: "REV",
    priority: "NORMAL",
    keywords: [
      "land",
      "mutation",
      "property",
      "record",
      "revenue",
      "जमीन",
      "राजस्व",
    ],
  },
  {
    code: "WELFARE",
    name: "Pension & Social Welfare",
    department: "SWD",
    priority: "NORMAL",
    keywords: ["pension", "welfare", "disability", "widow", "पेंशन", "कल्याण"],
  },
  {
    code: "RATION",
    name: "Ration & Civil Supplies",
    department: "FCS",
    priority: "HIGH",
    keywords: ["ration", "food", "pds", "supply", "राशन", "खाद्य"],
  },
  {
    code: "TRANSPORT",
    name: "Public Transport",
    department: "TRN",
    priority: "NORMAL",
    keywords: ["bus", "transport", "permit", "vehicle", "बस", "परिवहन"],
  },
  {
    code: "DISASTER",
    name: "Disaster & Emergency",
    department: "DM",
    priority: "URGENT",
    keywords: [
      "flood",
      "fire",
      "disaster",
      "emergency",
      "earthquake",
      "बाढ़",
      "आपदा",
    ],
  },
  {
    code: "GENERAL",
    name: "General / Other",
    department: "GA",
    priority: "NORMAL",
    keywords: ["other", "general", "अन्य", "सामान्य"],
  },
] as const;

const SLA_DEFAULTS = [
  {
    entityType: "GRIEVANCE",
    name: "Citizen grievance",
    table: {
      URGENT: [2, 24],
      HIGH: [8, 72],
      NORMAL: [24, 168],
      LOW: [48, 360],
    },
  },
  {
    entityType: "FILE",
    name: "Digital file movement",
    table: {
      URGENT: [2, 24],
      HIGH: [8, 72],
      NORMAL: [24, 168],
      LOW: [48, 336],
    },
  },
  {
    entityType: "APPLICATION",
    name: "Citizen application",
    table: {
      URGENT: [4, 48],
      HIGH: [8, 120],
      NORMAL: [24, 240],
      LOW: [48, 480],
    },
  },
  {
    entityType: "TASK",
    name: "Officer task",
    table: {
      URGENT: [4, 24],
      HIGH: [8, 72],
      NORMAL: [24, 168],
      LOW: [48, 336],
    },
  },
] as const;

const FILE_CATEGORIES = [
  {
    code: "GEN",
    name: "General Correspondence",
    department: "GA",
    confidentiality: "INTERNAL",
  },
  {
    code: "FIN",
    name: "Financial Records",
    department: "FIN",
    confidentiality: "CONFIDENTIAL",
  },
  {
    code: "SRV",
    name: "Service Delivery Files",
    department: "GA",
    confidentiality: "INTERNAL",
  },
  {
    code: "HR",
    name: "Establishment & HR",
    department: "GA",
    confidentiality: "CONFIDENTIAL",
  },
  {
    code: "INF",
    name: "Infrastructure Files",
    department: "PWD",
    confidentiality: "INTERNAL",
  },
  {
    code: "DIS",
    name: "Disaster Management Files",
    department: "DM",
    confidentiality: "CONFIDENTIAL",
  },
  {
    code: "LEGAL",
    name: "Legal & Restricted Files",
    department: "GA",
    confidentiality: "RESTRICTED",
  },
] as const;

const MOVEMENT_RULES = [
  {
    name: "Clerk to Officer review",
    fromRole: "CLERK",
    toRole: "OFFICER",
    requiresApproval: false,
  },
  {
    name: "Officer to Department Head approval",
    fromRole: "OFFICER",
    toRole: "DEPARTMENT_HEAD",
    requiresApproval: true,
  },
  {
    name: "Department Head to District Admin approval",
    fromRole: "DEPARTMENT_HEAD",
    toRole: "DISTRICT_ADMIN",
    requiresApproval: true,
  },
  {
    name: "District Admin to Super Admin approval",
    fromRole: "DISTRICT_ADMIN",
    toRole: "SUPER_ADMIN",
    requiresApproval: true,
  },
] as const;

const RETENTION_RULES = [
  {
    name: "General files",
    entityType: "FILE",
    confidentiality: "INTERNAL",
    retentionDays: 3650,
    archiveAfterDays: 1825,
  },
  {
    name: "Confidential files",
    entityType: "FILE",
    confidentiality: "CONFIDENTIAL",
    retentionDays: 5475,
    archiveAfterDays: 3650,
  },
  {
    name: "Restricted files",
    entityType: "FILE",
    confidentiality: "RESTRICTED",
    retentionDays: 7300,
    archiveAfterDays: 5475,
  },
  {
    name: "Grievance records",
    entityType: "GRIEVANCE",
    confidentiality: "INTERNAL",
    retentionDays: 2555,
    archiveAfterDays: 1095,
  },
  {
    name: "Application records",
    entityType: "APPLICATION",
    confidentiality: "INTERNAL",
    retentionDays: 3650,
    archiveAfterDays: 1825,
  },
] as const;

interface FieldSeed {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "date" | "select";
  required: boolean;
  options?: string[];
}

function form(fields: FieldSeed[]): { fields: FieldSeed[] } {
  return { fields };
}

const APPLICATION_TYPES = [
  {
    code: "INC",
    name: "Income Certificate",
    department: "REV",
    description:
      "Application for an income certificate for scheme, admission or other official use.",
    documents: [
      { key: "identity", label: "Identity proof", required: true },
      { key: "address", label: "Address proof", required: true },
      { key: "income", label: "Income proof", required: true },
    ],
    fields: [
      {
        key: "annualIncome",
        label: "Annual family income",
        type: "number",
        required: true,
      },
      {
        key: "purpose",
        label: "Purpose of certificate",
        type: "text",
        required: true,
      },
      {
        key: "address",
        label: "Residential address",
        type: "textarea",
        required: true,
      },
      {
        key: "familyMembers",
        label: "Number of family members",
        type: "number",
        required: false,
      },
    ],
  },
  {
    code: "DOM",
    name: "Residence Certificate",
    department: "REV",
    description: "Application for a residence or domicile certificate.",
    documents: [
      { key: "identity", label: "Identity proof", required: true },
      { key: "address", label: "Address proof", required: true },
    ],
    fields: [
      {
        key: "yearsOfResidence",
        label: "Years of residence",
        type: "number",
        required: true,
      },
      {
        key: "address",
        label: "Residential address",
        type: "textarea",
        required: true,
      },
      {
        key: "purpose",
        label: "Purpose of certificate",
        type: "text",
        required: false,
      },
    ],
  },
  {
    code: "CST",
    name: "Caste Certificate",
    department: "REV",
    description: "Application for a caste certificate.",
    documents: [
      { key: "identity", label: "Identity proof", required: true },
      { key: "address", label: "Address proof", required: true },
      { key: "family", label: "Family caste proof", required: true },
    ],
    fields: [
      {
        key: "casteCategory",
        label: "Caste category",
        type: "select",
        required: true,
        options: ["SC", "ST", "OBC", "Other"],
      },
      { key: "subCaste", label: "Sub-caste", type: "text", required: true },
      {
        key: "purpose",
        label: "Purpose of certificate",
        type: "text",
        required: false,
      },
    ],
  },
  {
    code: "BRT",
    name: "Birth Certificate",
    department: "HLT",
    description: "Registration or issuance of a birth certificate.",
    documents: [
      {
        key: "hospital",
        label: "Hospital record or birth proof",
        required: true,
      },
    ],
    fields: [
      { key: "childName", label: "Child name", type: "text", required: true },
      {
        key: "dateOfBirth",
        label: "Date of birth",
        type: "date",
        required: true,
      },
      {
        key: "placeOfBirth",
        label: "Place of birth",
        type: "text",
        required: true,
      },
      {
        key: "gender",
        label: "Gender",
        type: "select",
        required: true,
        options: ["Male", "Female", "Other"],
      },
    ],
  },
  {
    code: "DTH",
    name: "Death Certificate",
    department: "HLT",
    description: "Registration or issuance of a death certificate.",
    documents: [
      {
        key: "hospital",
        label: "Hospital record or death proof",
        required: true,
      },
    ],
    fields: [
      {
        key: "deceasedName",
        label: "Name of deceased",
        type: "text",
        required: true,
      },
      {
        key: "dateOfDeath",
        label: "Date of death",
        type: "date",
        required: true,
      },
      {
        key: "placeOfDeath",
        label: "Place of death",
        type: "text",
        required: true,
      },
      {
        key: "relation",
        label: "Applicant relation",
        type: "text",
        required: true,
      },
    ],
  },
  {
    code: "RAT",
    name: "Ration Card",
    department: "FCS",
    description: "New ration card or correction in an existing ration card.",
    documents: [
      { key: "identity", label: "Identity proof", required: true },
      { key: "address", label: "Address proof", required: true },
      { key: "family", label: "Family member details", required: true },
    ],
    fields: [
      {
        key: "familySize",
        label: "Family size",
        type: "number",
        required: true,
      },
      {
        key: "annualIncome",
        label: "Annual family income",
        type: "number",
        required: true,
      },
      {
        key: "address",
        label: "Residential address",
        type: "textarea",
        required: true,
      },
      {
        key: "cardType",
        label: "Card type",
        type: "select",
        required: true,
        options: ["Priority", "Antyodaya", "General"],
      },
    ],
  },
  {
    code: "OAP",
    name: "Old Age Pension",
    department: "SWD",
    description: "Application for an old age pension scheme.",
    documents: [
      { key: "identity", label: "Identity proof", required: true },
      { key: "age", label: "Age proof", required: true },
      { key: "bank", label: "Bank account details", required: true },
    ],
    fields: [
      {
        key: "dateOfBirth",
        label: "Date of birth",
        type: "date",
        required: true,
      },
      {
        key: "bankAccount",
        label: "Bank account number",
        type: "text",
        required: true,
      },
      {
        key: "annualIncome",
        label: "Annual income",
        type: "number",
        required: true,
      },
    ],
  },
  {
    code: "WDP",
    name: "Widow Pension",
    department: "SWD",
    description: "Application for a widow pension scheme.",
    documents: [
      { key: "identity", label: "Identity proof", required: true },
      { key: "death", label: "Spouse death certificate", required: true },
      { key: "bank", label: "Bank account details", required: true },
    ],
    fields: [
      { key: "spouseName", label: "Spouse name", type: "text", required: true },
      {
        key: "dateOfDeath",
        label: "Date of spouse death",
        type: "date",
        required: true,
      },
      {
        key: "bankAccount",
        label: "Bank account number",
        type: "text",
        required: true,
      },
    ],
  },
  {
    code: "DSP",
    name: "Disability Pension",
    department: "SWD",
    description: "Application for a disability pension or support scheme.",
    documents: [
      { key: "identity", label: "Identity proof", required: true },
      { key: "disability", label: "Disability certificate", required: true },
      { key: "bank", label: "Bank account details", required: true },
    ],
    fields: [
      {
        key: "disabilityType",
        label: "Disability type",
        type: "text",
        required: true,
      },
      {
        key: "disabilityPercentage",
        label: "Disability percentage",
        type: "number",
        required: true,
      },
      {
        key: "bankAccount",
        label: "Bank account number",
        type: "text",
        required: true,
      },
    ],
  },
  {
    code: "WTC",
    name: "Water Connection",
    department: "WRD",
    description: "New water connection or transfer of an existing connection.",
    documents: [
      { key: "identity", label: "Identity proof", required: true },
      { key: "ownership", label: "Property ownership proof", required: true },
    ],
    fields: [
      {
        key: "address",
        label: "Connection address",
        type: "textarea",
        required: true,
      },
      {
        key: "connectionType",
        label: "Connection type",
        type: "select",
        required: true,
        options: ["Domestic", "Commercial", "Institutional"],
      },
      {
        key: "propertyDetails",
        label: "Property details",
        type: "text",
        required: false,
      },
    ],
  },
  {
    code: "ELC",
    name: "Electricity Connection",
    department: "ELEC",
    description: "New electricity connection or load enhancement.",
    documents: [
      { key: "identity", label: "Identity proof", required: true },
      { key: "ownership", label: "Property ownership proof", required: true },
    ],
    fields: [
      {
        key: "address",
        label: "Connection address",
        type: "textarea",
        required: true,
      },
      {
        key: "loadRequired",
        label: "Load required (kW)",
        type: "number",
        required: true,
      },
      {
        key: "connectionType",
        label: "Connection type",
        type: "select",
        required: true,
        options: ["Domestic", "Commercial", "Industrial", "Agricultural"],
      },
    ],
  },
  {
    code: "BLD",
    name: "Building Permission",
    department: "MUN",
    description: "Permission for construction or modification of a building.",
    documents: [
      { key: "ownership", label: "Ownership proof", required: true },
      { key: "drawing", label: "Building drawing", required: true },
      { key: "tax", label: "Property tax receipt", required: true },
    ],
    fields: [
      { key: "plotNumber", label: "Plot number", type: "text", required: true },
      {
        key: "plotArea",
        label: "Plot area (sq. ft.)",
        type: "number",
        required: true,
      },
      {
        key: "buildingType",
        label: "Building type",
        type: "text",
        required: true,
      },
      {
        key: "address",
        label: "Site address",
        type: "textarea",
        required: true,
      },
    ],
  },
] as const;

const KNOWLEDGE_ARTICLES = [
  {
    locale: "en",
    slug: "submit-a-grievance",
    title: "How to submit a grievance",
    category: "Grievances",
    tags: ["grievance", "complaint", "submit"],
    keywords: ["submit", "grievance", "complaint", "register", "शिकायत"],
    content:
      "Sign in to your citizen account and open Submit Grievance. Enter a clear subject and a detailed description of at least twenty characters, select the category and location, and attach supporting documents if available. Submit the grievance to receive a unique grievance ID. You can track its status from the Track Grievance page. Only public status updates and citizen-visible documents are shown to you; internal departmental notes are never exposed.",
  },
  {
    locale: "en",
    slug: "track-grievance-status",
    title: "Tracking grievance status and timelines",
    category: "Grievances",
    tags: ["grievance", "status", "sla", "tracking"],
    keywords: ["track", "status", "sla", "timeline", "deadline"],
    content:
      "Open My Grievances to see every complaint with its current status, priority and service deadline. The status moves through submission, verification, assignment, investigation, action taken, approval and resolution. Each change is recorded in the public timeline. If the published service deadline passes, the grievance is marked overdue and escalates to the competent authority. You may request reopening with a reason after a grievance is resolved or closed, and the request is reviewed by an authorised officer.",
  },
  {
    locale: "en",
    slug: "submit-an-application",
    title: "Submitting a service application",
    category: "Applications",
    tags: ["application", "certificate", "documents"],
    keywords: ["application", "certificate", "documents", "submit", "आवेदन"],
    content:
      "Open Apply for Service, choose the application type and complete every required form field. Upload each required document in a supported format. After submission the clerk verifies the documents, and any missing document is reported against your application. A complete application moves to departmental review and then to an authorised decision. You can follow the verification status and missing document list from your dashboard.",
  },
  {
    locale: "en",
    slug: "digital-file-and-qr-tracking",
    title: "Digital file movement and QR tracking",
    category: "Digital Files",
    tags: ["file", "qr", "movement"],
    keywords: ["file", "qr", "movement", "dispatch", "receive", "tracking"],
    content:
      "Every registered file receives a file number and a signed QR code. When a file is dispatched, the receiving officer scans the QR code or confirms receipt manually. The movement record stores the sender, receiver, dispatch time, receipt time, action required and remarks. Authorised users can view the full movement history. A QR scan confirms movement only; it does not replace mandatory government record-keeping procedures.",
  },
  {
    locale: "en",
    slug: "helpdesk-and-chatbot",
    title: "Getting help from the chatbot and helpdesk",
    category: "Support",
    tags: ["help", "chatbot", "helpdesk", "ticket"],
    keywords: ["help", "chatbot", "helpdesk", "ticket", "support", "सहायता"],
    content:
      "The AI Help Chatbot answers questions from approved knowledge articles and supports English, Hindi and Hinglish. If no approved answer is found, or you need personal assistance, the conversation can be escalated to the helpdesk and a ticket is created. Helpdesk replies appear in the ticket conversation. Internal staff notes are not shown to citizens.",
  },
  {
    locale: "en",
    slug: "account-security",
    title: "Account security and password guidance",
    category: "Account",
    tags: ["account", "password", "security"],
    keywords: ["password", "security", "login", "account", "reset"],
    content:
      "Use a strong password with at least ten characters including upper case, lower case, a digit and a symbol. Never share your password or one-time codes. Repeated failed sign-in attempts temporarily lock the account. If you forget your password, use the Forgot Password option and follow the verification code sent to your registered email or mobile number. Sign out from shared devices after use.",
  },
  {
    locale: "hi",
    slug: "submit-a-grievance",
    title: "शिकायत दर्ज कैसे करें",
    category: "Grievances",
    tags: ["शिकायत", "दर्ज"],
    keywords: ["शिकायत", "दर्ज", "submit", "grievance"],
    content:
      "नागरिक खाते में साइन इन करें और शिकायत दर्ज करें विकल्प खोलें। स्पष्ट विषय तथा कम से कम बीस अक्षरों का विवरण लिखें, श्रेणी और स्थान चुनें तथा उपलब्ध दस्तावेज संलग्न करें। जमा करने पर आपको एक विशिष्ट शिकायत आईडी मिलेगी। शिकायत की स्थिति ट्रैक शिकायत पृष्ठ से देखी जा सकती है। आपको केवल सार्वजनिक स्थिति और नागरिक-दृश्य दस्तावेज दिखाई देंगे; आंतरिक विभागीय टिप्पणियाँ नहीं दिखाई जाएंगी।",
  },
  {
    locale: "hi",
    slug: "track-grievance-status",
    title: "शिकायत की स्थिति और समय सीमा",
    category: "Grievances",
    tags: ["शिकायत", "स्थिति", "समय सीमा"],
    keywords: ["स्थिति", "समय सीमा", "ट्रैक", "status", "sla"],
    content:
      "मेरी शिकायतें पृष्ठ पर प्रत्येक शिकायत की वर्तमान स्थिति, प्राथमिकता और सेवा समय सीमा देखी जा सकती है। स्थिति जमा, सत्यापन, आवंटन, जांच, कार्रवाई, अनुमोदन और समाधान के क्रम में बदलती है। प्रत्येक परिवर्तन सार्वजनिक टाइमलाइन में दर्ज होता है। निर्धारित समय सीमा बीतने पर शिकायत अतिदेय होती है और संबंधित अधिकारी को उन्नत की जाती है। समाधान के बाद कारण देकर पुनः खोलने का अनुरोध किया जा सकता है।",
  },
  {
    locale: "hi",
    slug: "submit-an-application",
    title: "सेवा आवेदन कैसे जमा करें",
    category: "Applications",
    tags: ["आवेदन", "प्रमाण पत्र", "दस्तावेज"],
    keywords: ["आवेदन", "प्रमाण", "दस्तावेज", "application"],
    content:
      "सेवा के लिए आवेदन विकल्प खोलें, आवेदन प्रकार चुनें और सभी अनिवार्य फॉर्म फील्ड भरें। प्रत्येक अनिवार्य दस्तावेज समर्थित प्रारूप में अपलोड करें। जमा करने के बाद लिपिक दस्तावेजों का सत्यापन करता है और छूटे दस्तावेज आवेदन में दर्शाए जाते हैं। पूर्ण आवेदन विभागीय समीक्षा के बाद अधिकृत निर्णय के लिए भेजा जाता है। आप अपने डैशबोर्ड से सत्यापन स्थिति और छूटे दस्तावेजों की सूची देख सकते हैं।",
  },
  {
    locale: "hi",
    slug: "digital-file-and-qr-tracking",
    title: "डिजिटल फाइल प्रवाह और क्यूआर ट्रैकिंग",
    category: "Digital Files",
    tags: ["फाइल", "क्यूआर", "प्रवाह"],
    keywords: ["फाइल", "क्यूआर", "प्रवाह", "file", "qr"],
    content:
      "प्रत्येक पंजीकृत फाइल को फाइल नंबर और हस्ताक्षरित क्यूआर कोड मिलता है। फाइल भेजने पर प्राप्तकर्ता अधिकारी क्यूआर कोड स्कैन करता है अथवा मैन्युअल रूप से प्राप्ति की पुष्टि करता है। प्रवाह रिकॉर्ड में प्रेषक, प्राप्तकर्ता, प्रेषण समय, प्राप्ति समय, आवश्यक कार्रवाई और टिप्पणियाँ सुरक्षित रहती हैं। अधिकृत उपयोगकर्ता पूरा प्रवाह इतिहास देख सकते हैं। क्यूआर स्कैन केवल प्रवाह की पुष्टि करता है; यह अनिवार्य सरकारी अभिलेख प्रक्रिया का विकल्प नहीं है।",
  },
] as const;

const NOTIFICATION_TEMPLATES = [
  {
    key: "GRIEVANCE_SUBMITTED",
    name: "Grievance submitted",
    subject: "Grievance {{grievanceId}} submitted",
    body: "Your grievance {{grievanceId}} has been submitted successfully. You can track its status in your account.",
    variables: ["grievanceId"],
  },
  {
    key: "GRIEVANCE_ASSIGNED",
    name: "Grievance assigned",
    subject: "Grievance {{grievanceId}} assigned for action",
    body: "Grievance {{grievanceId}} has been assigned to you. Please review it before {{dueDate}}.",
    variables: ["grievanceId", "dueDate"],
  },
  {
    key: "GRIEVANCE_OVERDUE",
    name: "Grievance overdue",
    subject: "Overdue grievance {{grievanceId}}",
    body: "Grievance {{grievanceId}} has crossed its service deadline. Immediate action is required.",
    variables: ["grievanceId"],
  },
  {
    key: "FILE_FORWARDED",
    name: "File forwarded",
    subject: "File {{fileNumber}} received",
    body: "File {{fileNumber}} has been forwarded to you for {{action}}.",
    variables: ["fileNumber", "action"],
  },
  {
    key: "APPLICATION_STATUS_CHANGED",
    name: "Application status changed",
    subject: "Application {{applicationId}} status updated",
    body: "Application {{applicationId}} is now {{status}}.",
    variables: ["applicationId", "status"],
  },
  {
    key: "MEETING_SCHEDULED",
    name: "Meeting scheduled",
    subject: "Meeting scheduled: {{title}}",
    body: "A meeting titled {{title}} is scheduled on {{date}} at {{time}}.",
    variables: ["title", "date", "time"],
  },
  {
    key: "TASK_DEADLINE",
    name: "Task deadline reminder",
    subject: "Task {{taskId}} due {{dueDate}}",
    body: "Task {{taskId}} is due on {{dueDate}}. Please update the task status.",
    variables: ["taskId", "dueDate"],
  },
  {
    key: "ACCOUNT_CREATED",
    name: "Account created",
    subject: "Your SDAS account has been created",
    body: "An SDAS account has been created for you. Use the password reset option to set your password.",
    variables: [],
  },
] as const;

const SETTINGS = [
  {
    key: "platform.name",
    value: "Smart District Administration System",
    category: "general",
    description: "Application name shown across the platform.",
  },
  {
    key: "platform.supportEmail",
    value: env.SMTP_FROM || env.SEED_ADMIN_EMAIL,
    category: "general",
    description: "Support email shown to citizens.",
  },
  {
    key: "platform.supportPhone",
    value: "",
    category: "general",
    description: "Support phone number shown to citizens.",
  },
  {
    key: "security.sessionTimeoutMinutes",
    value: 30,
    category: "security",
    description: "Access token lifetime in minutes.",
  },
  {
    key: "security.maxLoginAttempts",
    value: 5,
    category: "security",
    description: "Failed sign-in attempts allowed before a temporary lock.",
  },
  {
    key: "security.lockoutMinutes",
    value: 30,
    category: "security",
    description: "Account lock duration after repeated failures.",
  },
  {
    key: "notifications.emailEnabled",
    value: isEmailConfigured(),
    category: "notifications",
    description: "Email delivery is enabled when SMTP is configured.",
  },
  {
    key: "notifications.smsEnabled",
    value: isSmsConfigured(),
    category: "notifications",
    description: "SMS delivery is enabled when an SMS provider is configured.",
  },
  {
    key: "files.maxUploadMb",
    value: env.MAX_UPLOAD_MB,
    category: "files",
    description: "Maximum upload size in megabytes.",
  },
  {
    key: "files.allowedMimeTypes",
    value: [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
      "text/plain",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    category: "files",
    description: "MIME types accepted for document upload.",
  },
  {
    key: "reports.exportFormats",
    value: ["CSV", "XLSX", "PDF"],
    category: "reports",
    description: "Enabled export formats.",
  },
  {
    key: "ai.enabled",
    value: true,
    category: "ai",
    description: "Local AI-assisted classification and summaries are enabled.",
  },
  {
    key: "ai.requireHumanReview",
    value: true,
    category: "ai",
    description: "AI suggestions must be reviewed by an authorised user.",
  },
  {
    key: "ai.externalEnabled",
    value: Boolean(env.OPENROUTER_API_KEY || env.OPENAI_API_KEY),
    category: "ai",
    description:
      "Route AI assistance to the configured external provider. Requires OPENROUTER_API_KEY or OPENAI_API_KEY; human review still applies.",
  },
  {
    key: "restricted.moduleEnabled",
    value: env.RESTRICTED_MODULE_ENABLED,
    category: "security",
    description:
      "Restricted safety review is disabled unless separately approved.",
  },
  {
    key: "maintenance.mode",
    value: false,
    category: "general",
    description: "When enabled, citizen services are paused for maintenance.",
  },
] as const;

function permissionModule(code: string): string {
  const index = code.indexOf(".");
  return index === -1 ? "system" : code.slice(0, index);
}

function permissionAction(code: string): string {
  const index = code.indexOf(".");
  return index === -1 ? code : code.slice(index + 1);
}

function generatePassword(): string {
  return `Sdas@${crypto.randomBytes(6).toString("hex")}${crypto.randomInt(10, 100)}`;
}

async function seedAccessControl(): Promise<void> {
  for (const code of PERMISSIONS) {
    const description = `${permissionAction(code).replace(/[._]/g, " ")} in ${permissionModule(code)}`;
    await seedDoc(
      PermissionModel,
      { code },
      {
        module: permissionModule(code),
        action: permissionAction(code),
        description,
      },
      { code },
    );
  }

  for (const role of ROLES) {
    await seedDoc(
      RoleModel,
      { key: role },
      { permissions: [...ROLE_DEFAULT_PERMISSIONS[role]] },
      {
        key: role,
        name: ROLE_LABELS[role],
        description: ROLE_DESCRIPTIONS[role],
        isSystem: true,
      },
    );
  }
  logger.info(
    { permissions: PERMISSIONS.length, roles: ROLES.length },
    "Access control seeded",
  );
}

async function seedSuperAdmin(): Promise<void> {
  const email = env.SEED_ADMIN_EMAIL.toLowerCase();
  const existing = await User.findOne({ email }).lean();
  if (existing) {
    logger.info(
      { email },
      "Seed super admin already exists; password left unchanged",
    );
    return;
  }

  const password = env.SEED_ADMIN_PASSWORD ?? generatePassword();
  const passwordHash = await bcrypt.hash(password, 12);
  await User.create({
    name: env.SEED_ADMIN_NAME,
    email,
    mobile: env.SEED_ADMIN_MOBILE,
    passwordHash,
    role: "SUPER_ADMIN" as Role,
    designation: "System Administrator",
    status: "ACTIVE",
    passwordChangedAt: new Date(),
  });

  if (env.SEED_ADMIN_PASSWORD) {
    logger.info({ email }, "Seed super admin created");
  } else {
    logger.warn(
      { email, password },
      "Seed super admin created with a generated password. Change it after first sign-in.",
    );
  }
}

async function seedDistrict(): Promise<
  Map<string, { id: string; name: string }>
> {
  await seedDoc(
    DistrictConfig,
    { key: "default" },
    {},
    {
      key: "default",
      name: env.DISTRICT_NAME,
      code: env.DISTRICT_CODE,
      timezone: "Asia/Kolkata",
      workingDays: ["MON", "TUE", "WED", "THU", "FRI", "SAT"],
      locale: "en",
    },
  );

  const unit = await AdministrativeUnit.findOneAndUpdate(
    { code: "HQ" },
    {
      $setOnInsert: {
        code: "HQ",
        name: "District Headquarters",
        type: "TEHSIL",
        active: true,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
  const unitId = unit?._id ?? null;

  const departments = new Map<string, { id: string; name: string }>();
  for (const item of DEPARTMENTS) {
    const department = await Department.findOneAndUpdate(
      { code: item.code },
      {
        $setOnInsert: {
          code: item.code,
          name: item.name,
          description: item.description,
          active: true,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
    if (!department) continue;
    departments.set(item.code, {
      id: String(department._id),
      name: department.name,
    });

    await Office.findOneAndUpdate(
      { code: `${item.code}-HQ` },
      {
        $setOnInsert: {
          code: `${item.code}-HQ`,
          name: `${item.name} Office`,
          department: department._id,
          tehsil: unitId,
          active: true,
        },
      },
      { upsert: true, setDefaultsOnInsert: true },
    );
  }

  return departments;
}

async function seedGrievanceConfig(
  departments: Map<string, { id: string; name: string }>,
): Promise<void> {
  const categoryIds = new Map<string, string>();
  for (const category of GRIEVANCE_CATEGORIES) {
    const department = departments.get(category.department);
    const doc = await GrievanceCategory.findOneAndUpdate(
      { code: category.code },
      {
        $setOnInsert: {
          code: category.code,
          name: category.name,
          defaultDepartment: department?.id ?? null,
          defaultPriority: category.priority,
          aiKeywords: category.keywords,
          requiredEvidence: [],
          active: true,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
    if (!doc) continue;
    categoryIds.set(category.code, String(doc._id));

    if (department) {
      await RoutingRule.updateOne(
        { category: doc._id, subcategory: null } as never,
        {
          $set: { department: department.id, priority: category.priority },
          $setOnInsert: {
            category: doc._id,
            subcategory: null,
            office: null,
            active: true,
          },
        } as never,
        { upsert: true } as never,
      );
    }
  }

  for (const rule of SLA_DEFAULTS) {
    for (const [priority, hours] of Object.entries(rule.table)) {
      const [responseHours, resolutionHours] = hours as readonly [
        number,
        number,
      ];
      await seedDoc(
        SLARule,
        {
          entityType: rule.entityType,
          category: null,
          priority,
          name: rule.name,
        },
        {},
        {
          entityType: rule.entityType,
          category: null,
          priority,
          name: rule.name,
          responseHours,
          resolutionHours,
          dueSoonHours: 24,
          escalationHours: [24, 48, 72],
          pauseAllowed: true,
          active: true,
        },
      );
    }
  }

  logger.info(
    { categories: categoryIds.size, departments: departments.size },
    "Grievance configuration seeded",
  );
}

async function seedFileConfig(
  departments: Map<string, { id: string; name: string }>,
): Promise<void> {
  for (const category of FILE_CATEGORIES) {
    await seedDoc(
      FileCategory,
      { code: category.code },
      {},
      {
        code: category.code,
        name: category.name,
        defaultDepartment: departments.get(category.department)?.id ?? null,
        defaultConfidentiality: category.confidentiality,
        active: true,
      },
    );
  }

  for (const rule of MOVEMENT_RULES) {
    await seedDoc(
      MovementRule,
      { name: rule.name },
      {},
      {
        name: rule.name,
        fromRole: rule.fromRole,
        toRole: rule.toRole,
        requiresApproval: rule.requiresApproval,
        active: true,
      },
    );
  }

  for (const rule of RETENTION_RULES) {
    await seedDoc(
      RetentionRule,
      { name: rule.name },
      {},
      {
        name: rule.name,
        entityType: rule.entityType,
        confidentiality: rule.confidentiality,
        retentionDays: rule.retentionDays,
        archiveAfterDays: rule.archiveAfterDays,
        active: true,
      },
    );
  }
  logger.info(
    {
      fileCategories: FILE_CATEGORIES.length,
      movementRules: MOVEMENT_RULES.length,
    },
    "Digital file configuration seeded",
  );
}

async function seedApplicationTypes(
  departments: Map<string, { id: string; name: string }>,
): Promise<void> {
  for (const type of APPLICATION_TYPES) {
    const department = departments.get(type.department);
    if (!department) continue;
    await seedDoc(
      ApplicationType,
      { code: type.code },
      {},
      {
        code: type.code,
        name: type.name,
        department: department.id,
        description: type.description,
        requiredDocuments: type.documents,
        formFieldSchema: form(type.fields as unknown as FieldSeed[]),
        active: true,
      },
    );
  }
  logger.info(
    { applicationTypes: APPLICATION_TYPES.length },
    "Application types seeded",
  );
}

function integrationSeeds(): Array<Record<string, unknown>> {
  const emailConfigured = isEmailConfigured();
  const smsConfigured = isSmsConfigured();
  const aiKeyPresent = Boolean(env.OPENROUTER_API_KEY || env.OPENAI_API_KEY);
  const aiProvider = env.OPENROUTER_API_KEY
    ? `OpenRouter (${env.OPENROUTER_MODEL})`
    : env.OPENAI_API_KEY
      ? `OpenAI (${env.OPENAI_MODEL})`
      : "Local heuristics";

  return [
    {
      key: "email",
      name: "Email delivery (SMTP)",
      category: "EMAIL",
      provider: emailConfigured ? "SMTP" : "",
      status: emailConfigured ? "CONFIGURED" : "NOT_CONFIGURED",
      notes: emailConfigured
        ? "SMTP credentials are present. Run Test Connection from Integration Management to verify delivery."
        : "SMTP credentials are not configured. Email notifications will remain disabled.",
    },
    {
      key: "sms",
      name: "SMS gateway",
      category: "SMS",
      provider: smsConfigured ? env.SMS_PROVIDER : "",
      status: smsConfigured ? "CONFIGURED" : "NOT_CONFIGURED",
      notes: smsConfigured
        ? "SMS provider credentials are present. Test the gateway before enabling SMS alerts."
        : "No approved SMS provider is configured. SMS alerts remain disabled.",
    },
    {
      key: "ai",
      name: "AI assistance",
      category: "AI",
      provider: aiProvider,
      status: aiKeyPresent ? "CONFIGURED" : "ACTIVE",
      notes: aiKeyPresent
        ? "An external AI key is present. Local classification remains available and every AI suggestion requires human review."
        : "Local-first classification, feedback analysis and meeting summaries are active. External AI is not configured.",
    },
    {
      key: "ocr",
      name: "OCR processing",
      category: "OCR",
      provider: "Local PDF text extraction",
      status: "ACTIVE",
      notes:
        "Local PDF extraction is available. Scanned images require an approved OCR provider before text extraction is enabled.",
    },
    {
      key: "weather",
      name: "Weather alerts",
      category: "WEATHER",
      provider: "",
      status: "NOT_CONFIGURED",
      notes:
        "No approved weather feed is configured. Weather alerts cannot be fetched automatically.",
    },
    {
      key: "government",
      name: "Government integrations",
      category: "GOVERNMENT",
      provider: "",
      status: "NOT_CONFIGURED",
      notes:
        "External government integrations are disabled until formally approved, configured and tested.",
    },
    {
      key: "storage",
      name: "Private document storage",
      category: "STORAGE",
      provider: "Local private storage",
      status: "ACTIVE",
      notes:
        "Uploaded documents are stored privately and served only through authorised API routes.",
    },
  ];
}

async function seedPlatform(): Promise<void> {
  for (const item of integrationSeeds()) {
    const { key, ...rest } = item;
    await seedDoc(Integration, { key }, {}, { key, ...rest });
  }

  for (const setting of SETTINGS) {
    await seedDoc(
      SystemSetting,
      { key: setting.key },
      {},
      {
        key: setting.key,
        value: setting.value,
        category: setting.category,
        description: setting.description,
      },
    );
  }

  for (const article of KNOWLEDGE_ARTICLES) {
    await seedDoc(
      KnowledgeArticle,
      { locale: article.locale, slug: article.slug },
      {},
      {
        ...article,
        status: "APPROVED",
        approvedAt: new Date(),
      },
    );
  }

  for (const template of NOTIFICATION_TEMPLATES) {
    await seedDoc(
      NotificationTemplate,
      { key: template.key, channel: "IN_APP", locale: "en" },
      {},
      {
        key: template.key,
        name: template.name,
        channel: "IN_APP",
        locale: "en",
        subject: template.subject,
        body: template.body,
        variables: template.variables,
        active: true,
      },
    );
  }
  logger.info(
    {
      settings: SETTINGS.length,
      knowledgeArticles: KNOWLEDGE_ARTICLES.length,
      notificationTemplates: NOTIFICATION_TEMPLATES.length,
    },
    "Platform configuration seeded",
  );
}

async function main(): Promise<void> {
  await connectDB();
  try {
    await seedAccessControl();
    await seedSuperAdmin();
    const departments = await seedDistrict();
    await seedGrievanceConfig(departments);
    await seedFileConfig(departments);
    await seedApplicationTypes(departments);
    await seedPlatform();
    logger.info("SDAS seed completed successfully");
  } finally {
    await disconnectDB();
  }
}

void main().catch((error) => {
  logger.fatal({ err: error }, "SDAS seed failed");
  process.exit(1);
});
