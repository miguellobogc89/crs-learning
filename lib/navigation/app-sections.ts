// lib/navigation/app-sections.ts
import {
  BarChart3,
  Plug,
  GraduationCap,
  Grid2X2,
  Home,
  Inbox,
  Library,
  Settings,
  UserRound,
} from "lucide-react";

export const APP_SECTIONS = {
  dashboard: {
    label: "Inicio",
    href: "/dashboard",
    icon: Home,
  },
  knowledge: {
    label: "Conocimiento",
    href: "/knowledge",
    icon: Library,
  },
  analytics: {
    label: "Analítica",
    href: "/analytics",
    icon: BarChart3,
  },
  connectors: {
    label: "Conectores",
    href: "/connectors",
    icon: Plug,
  },
  courses: {
    label: "Academy",
    href: "/courses",
    icon: GraduationCap,
  },
  achievements: {
    label: "Logros",
    href: "/achievements",
    icon: Grid2X2,
  },
  notifications: {
    label: "Bandeja",
    href: "/notifications",
    icon: Inbox,
  },
  mySpace: {
    label: "Mi espacio",
    href: "/my-space",
    icon: UserRound,
  },
  settings: {
    label: "Configuración",
    href: "/settings",
    icon: Settings,
  },
} as const;

export type AppSectionKey =
  keyof typeof APP_SECTIONS;
