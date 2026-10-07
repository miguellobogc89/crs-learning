
 // components/dashboard/dashboard-navigation.tsx
"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import {
  DASHBOARD_SECTIONS,
  dashboardHref,
} from "@/lib/navigation/dashboard-sections";
import { cn } from "@/lib/utils";

export function DashboardNavigation() {
  const searchParams = useSearchParams();
  const requestedView = searchParams.get("view");

  const activeView =
    DASHBOARD_SECTIONS.find(
      (section) => section.id === requestedView,
    )?.id ?? "home";

  return (
    <nav aria-label="Inicio" className="space-y-1">
      {DASHBOARD_SECTIONS.map((section) => {
        const Icon = section.icon;
        const active = section.id === activeView;

        return (
          <Link
            key={section.id}
            href={dashboardHref(section.id)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex min-h-9 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-[#EDF3FF] text-[#0A58FF]"
                : "text-slate-600 hover:bg-[#F0F4FC] hover:text-slate-900",
            )}
          >
            <Icon
              aria-hidden="true"
              strokeWidth={2.4}
              className={cn(
                "h-[18px] w-[18px] shrink-0",
                !active &&
                  "text-slate-500 group-hover:text-[#0A58FF]",
              )}
            />

            <span className="min-w-0 truncate">
              {section.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

export function DashboardSidebar() {
  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="border-b border-slate-200/60 px-4 py-4">
        <h2 className="text-[13px] font-semibold text-slate-900">
          Inicio
        </h2>
      </div>

      <div className="p-3">
        <DashboardNavigation />
      </div>
    </div>
  );
}
