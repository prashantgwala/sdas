import type { IdRef, UserRef } from "@/lib/types";

export interface IncidentSummary {
  _id: string;
  incidentId?: string;
  type: string;
  title: string;
  description?: string;
  severity: string;
  status: string;
  reportedAt?: string;
  reportedBy?: UserRef | null;
  commander?: UserRef | null;
  location?: {
    address?: string;
    tehsil?: IdRef | string | null;
    geo?: { coordinates?: number[] };
  };
  weatherAlert?: { _id?: string; type?: string; severity?: string; area?: string; status?: string } | null;
  assignedTeams?: Array<{
    name: string;
    contactPerson?: string;
    contactPhone?: string;
    members?: number;
    status?: string;
  }>;
  resources?: Array<{
    name: string;
    category?: string;
    quantity?: number;
    unit?: string;
    available?: number;
    location?: string;
  }>;
  actions?: Array<{ text: string; actor?: UserRef | null; at?: string }>;
  closedAt?: string | null;
  closureReport?: string | null;
}

export interface WeatherAlertItem {
  _id: string;
  type: string;
  severity: string;
  area: string;
  validFrom: string;
  validTo: string;
  advisory: string;
  status: string;
  active: boolean;
  issuedAt?: string;
  source?: string;
}
