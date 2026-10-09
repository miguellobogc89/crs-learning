// components/search/search-result-item.tsx

"use client";

import { cn } from "@/lib/utils";
import type { SearchResult, SearchCategory } from "@/types/search";
import {
  type LucideIcon,
  Users,
  FileText,
  BookOpen,
  Folder,
  Users2,
  Lightbulb,
  ArrowRight,
  File,
} from "lucide-react";

const CATEGORY_ICONS: Record<SearchCategory, LucideIcon> = {
  usuarios: Users,
  articulos: Lightbulb,
  documentos: FileText,
  bibliotecas: BookOpen,
  carpetas: Folder,
  equipos: Users2,
};

const CATEGORY_COLORS: Record<SearchCategory, string> = {
  usuarios: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  articulos:
    "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  documentos:
    "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  bibliotecas:
    "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  carpetas:
    "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  equipos: "bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300",
};

const CATEGORY_LABELS: Record<SearchCategory, string> = {
  usuarios: "Perfil",
  articulos: "Artículo",
  documentos: "Documento",
  bibliotecas: "Biblioteca",
  carpetas: "Carpeta",
  equipos: "Equipo",
};

const FALLBACK_COLOR = "bg-muted text-muted-foreground";

type SearchResultItemProps = SearchResult & {
  isSelected?: boolean;
};

export function SearchResultItem({
  title,
  description,
  category,
  avatar,
  isSelected,
}: SearchResultItemProps) {
  // Si llega una categoría desconocida, usamos valores por defecto en vez de romper
  if (process.env.NODE_ENV !== "production" && !CATEGORY_ICONS[category]) {
    console.warn("SearchResultItem: categoría desconocida:", JSON.stringify(category));
  }

  const Icon = CATEGORY_ICONS[category] ?? File;
  const colorClass = CATEGORY_COLORS[category] ?? FALLBACK_COLOR;
  const label = CATEGORY_LABELS[category] ?? "Resultado";

  return (
    <div
      className={cn(
        "group flex cursor-pointer items-center gap-3 rounded-lg px-4 py-3.5 transition-all",
        isSelected
          ? "bg-accent shadow-sm ring-2 ring-foreground/20"
          : "hover:bg-muted/60"
      )}
    >
      {/* Icon/Avatar */}
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
          colorClass
        )}
      >
        {avatar ? (
          <img
            src={avatar}
            alt={title}
            className="h-10 w-10 rounded-lg object-cover"
          />
        ) : (
          <Icon className="h-5 w-5" />
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">
          {title}
        </p>
        {description && (
          <p className="truncate text-xs text-muted-foreground">
            {description}
          </p>
        )}
      </div>

      {/* Badge + Arrow */}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <span className="hidden text-xs font-medium text-muted-foreground sm:inline">
          {label}
        </span>
        <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-all group-hover:opacity-100" />
      </div>
    </div>
  );
}