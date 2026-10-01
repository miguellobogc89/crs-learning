import {
  BookOpen, ClipboardList, Home, LayoutGrid,
  MessageSquare, Plus, Settings, ThumbsUp, Trophy,
} from "lucide-react";

export const ACADEMY_SECTIONS = [
  { id: "home", label: "Inicio", icon: Home },
  { id: "catalog", label: "Catálogo", icon: LayoutGrid },
  { id: "learning", label: "Mi aprendizaje", icon: BookOpen },
  { id: "required", label: "Obligatorios", icon: ClipboardList },
  { id: "requests", label: "Solicitudes", icon: MessageSquare },
  { id: "create", label: "Crear curso", icon: Plus },
  { id: "votes", label: "Mis votos", icon: ThumbsUp },
  { id: "achievements", label: "Mis logros", icon: Trophy },
  { id: "admin", label: "Administración", icon: Settings },
] as const;

export function academyHref(id: string) {
  return id === "home" ? "/courses" : `/courses?view=${id}`;
}

