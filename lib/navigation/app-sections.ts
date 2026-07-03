// lib/navigation/app-sections.ts
import {
  BookOpen,
  GraduationCap,
  Grid2X2,
  Settings,
  User,
} from "lucide-react";

export const APP_SECTIONS = {
  dashboard: {
    label: "Dashboard",
    href: "/dashboard",
    icon: BookOpen,
  },
  knowledge: {
    label: "Knowledge",
    href: "/knowledge",
    icon: BookOpen,
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
  profile: {
    label: "Perfil",
    href: "/profile",
    icon: User,
  },
  settings: {
    label: "Configuración",
    href: "/settings",
    icon: Settings,
  },
} as const;

export type AppSectionKey = keyof typeof APP_SECTIONS;