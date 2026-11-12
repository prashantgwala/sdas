"use client";

import { useState } from "react";
import { DepartmentManager } from "@/components/admin/department-manager";
import { DistrictConfigForm } from "@/components/admin/district-config-form";
import { OfficeManager } from "@/components/admin/office-manager";
import { UnitManager } from "@/components/admin/unit-manager";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "departments", label: "Departments" },
  { key: "units", label: "Administrative units" },
  { key: "offices", label: "Offices" },
  { key: "district", label: "District profile" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function OrgManager() {
  const [tab, setTab] = useState<TabKey>("departments");

  return (
    <div>
      <div role="tablist" aria-label="Organization settings" className="mb-5 flex flex-wrap gap-1 border-b border-border">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            onClick={() => setTab(item.key)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-[12.5px] font-semibold transition-colors",
              tab === item.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "departments" ? <DepartmentManager /> : null}
      {tab === "units" ? <UnitManager /> : null}
      {tab === "offices" ? <OfficeManager /> : null}
      {tab === "district" ? <DistrictConfigForm /> : null}
    </div>
  );
}
