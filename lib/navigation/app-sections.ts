// lib/navigation/app-sections.ts
import {
  GraduationCap,
  Grid2X2,
  Home,
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
    label: "Knowledge",
    href: "/knowledge",
    icon: Library,
  },
  courses: {
    label: "Cursos",
    href: "/courses",
    icon: GraduationCap,
  },
  achievements: {
    label: "Logros",
    href: "/achievements",
    icon: Grid2X2,
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