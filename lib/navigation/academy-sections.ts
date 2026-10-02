// lib/navigation/academy-sections.ts

import {
  BookOpen,
  ClipboardList,
  Home,
  LayoutGrid,
  MessageSquare,
  Settings,
  ThumbsUp,
  Trophy,
} from "lucide-react";

export const ACADEMY_SECTIONS = [
  {
    id: "home",
    label: "Inicio",
    icon: Home,
  },
  {
    id: "catalog",
    label: "Catálogo",
    icon: LayoutGrid,
  },
  {
    id: "learning",
    label: "Mi aprendizaje",
    icon: BookOpen,
  },
  {
    id: "required",
    label: "Obligatorios",
    icon: ClipboardList,
  },
  {
    id: "requests",
    label: "Solicitudes",
    icon: MessageSquare,
  },
  {
    id: "votes",
    label: "Mis votos",
    icon: ThumbsUp,
  },
  {
    id: "achievements",
    label: "Mis logros",
    icon: Trophy,
  },
  {
    id: "admin",
    label: "Gestión de cursos",
    icon: Settings,
  },
] as const;

export function academyHref(id: string) {
  return id === "home" ? "/courses" : `/courses?view=${id}`;
}