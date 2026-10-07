
 // lib/navigation/dashboard-sections.ts
import {
  House,
  Building2,
  SlidersHorizontal,
  ChartNoAxesColumn,
} from "lucide-react";

export const DASHBOARD_SECTIONS = [
  {
    id: "home",
    label: "Inicio",
    icon: House,
  },
  {
    id: "organization",
    label: "Mi organización",
    icon: Building2,
  },
  {
    id: "administration",
    label: "Administración",
    icon: SlidersHorizontal,
  },
  {
    id: "plan",
    label: "Plan y consumo",
    icon: ChartNoAxesColumn,
  },
] as const;

export type DashboardView =
  (typeof DASHBOARD_SECTIONS)[number]["id"];

export function dashboardHref(view: DashboardView) {
  return view === "home"
    ? "/dashboard"
    : `/dashboard?view=${view}`;
}
