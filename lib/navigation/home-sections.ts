// lib/navigation/home-sections.ts

import {
  Building2,
  ChartNoAxesColumn,
  House,
  SlidersHorizontal,
} from "lucide-react";

export const HOME_SECTIONS = [
  {
    id: "overview",
    label: "Resumen",
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

export type HomeView =
  (typeof HOME_SECTIONS)[number]["id"];

export function homeHref(view: HomeView) {
  return view === "overview"
    ? "/dashboard"
    : `/dashboard?view=${view}`;
}

export function getHomeSection(
  view?: string,
) {
  return (
    HOME_SECTIONS.find(
      (section) => section.id === view,
    ) ?? HOME_SECTIONS[0]
  );
}