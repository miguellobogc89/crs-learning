//app/(app)/search/page.tsx

"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BookOpen,
  FileText,
  Folder,
  GraduationCap,
  Library,
  Search,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import { searchGlobal } from "@/app/actions/search";
import { SearchResultItem } from "@/components/search/search-result-item";
import { Checkbox } from "@/components/ui/checkbox";
import type {
  SearchCategory,
  SearchGroup,
} from "@/lib/search/types";

interface FilterOption {
  id: SearchCategory;
  label: string;
  icon: LucideIcon;
}

const FILTER_OPTIONS: FilterOption[] = [
  {
    id: "usuarios",
    label: "Usuarios",
    icon: Users,
  },
  {
    id: "articulos",
    label: "Artículos",
    icon: BookOpen,
  },
  {
    id: "documentos",
    label: "Documentos",
    icon: FileText,
  },
  {
    id: "bibliotecas",
    label: "Bibliotecas",
    icon: Library,
  },
  {
    id: "carpetas",
    label: "Carpetas",
    icon: Folder,
  },
  {
    id: "equipos",
    label: "Equipos",
    icon: UsersRound,
  },
  {
    id: "cursos",
    label: "Cursos",
    icon: GraduationCap,
  },
];

const CATEGORY_CONFIG = FILTER_OPTIONS.reduce(
  (config, option) => {
    config[option.id] = {
      label: option.label,
      icon: option.icon,
    };

    return config;
  },
  {} as Partial<
    Record<
      SearchCategory,
      {
        label: string;
        icon: LucideIcon;
      }
    >
  >
);

export default function SearchPage() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q")?.trim() ?? "";

  const [selectedFilters, setSelectedFilters] = useState<SearchCategory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [grouped, setGrouped] = useState<SearchGroup[]>([]);
  const [totalResults, setTotalResults] = useState(0);

  useEffect(() => {
    if (!query) {
      setGrouped([]);
      setTotalResults(0);
      setIsLoading(false);
      return;
    }

    let isActive = true;

    async function performSearch(): Promise<void> {
      setIsLoading(true);

      try {
        const response = await searchGlobal({
          query,
          filters:
            selectedFilters.length > 0
              ? selectedFilters
              : undefined,
        });

        if (!isActive) {
          return;
        }

        setGrouped(response.groups);
        setTotalResults(response.total);
      } catch (error) {
        console.error("[SearchPage] Error:", error);

        if (!isActive) {
          return;
        }

        setGrouped([]);
        setTotalResults(0);
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void performSearch();

    return () => {
      isActive = false;
    };
  }, [query, selectedFilters]);

  function toggleFilter(filterId: SearchCategory): void {
    setSelectedFilters((currentFilters) =>
      currentFilters.includes(filterId)
        ? currentFilters.filter((filter) => filter !== filterId)
        : [...currentFilters, filterId]
    );
  }

  const hasResults = grouped.length > 0;
  const hasFilters = selectedFilters.length > 0;

  return (
    <div className="grid h-full min-h-0 grid-cols-1 overflow-hidden bg-background md:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="hidden overflow-y-auto border-r border-border bg-muted/20 md:block">
        <div className="p-5">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Categorías
            </h2>

            {hasFilters && (
              <button
                type="button"
                onClick={() => setSelectedFilters([])}
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Limpiar
              </button>
            )}
          </div>

          <div className="space-y-1">
            {FILTER_OPTIONS.map((option) => {
              const Icon = option.icon;
              const isSelected = selectedFilters.includes(option.id);

              const group = grouped.find(
                (item) => item.category === option.id
              );

              const count = group?.results.length ?? 0;

              return (
                <label
                  key={option.id}
                  className={[
                    "flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 transition-colors",
                    isSelected
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                  ].join(" ")}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleFilter(option.id)}
                    aria-label={`Filtrar por ${option.label}`}
                    className="shrink-0"
                  />

                  <Icon className="h-4 w-4 shrink-0" />

                  <span className="min-w-0 flex-1 text-sm">
                    {option.label}
                  </span>

                  {!isLoading && count > 0 && (
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {count}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </div>
      </aside>

      <main className="min-w-0 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]">
        <div className="mx-auto w-full max-w-6xl px-6 py-8 lg:px-10">
          <div className="mb-8">
            <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Search className="h-4 w-4" />
              <span>Búsqueda global</span>
            </div>

            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {query
                ? `Resultados para “${query}”`
                : "Resultados de búsqueda"}
            </h1>

            <p className="mt-1.5 text-sm text-muted-foreground">
              {isLoading
                ? "Buscando coincidencias..."
                : query
                  ? `${totalResults} resultado${
                      totalResults === 1 ? "" : "s"
                    } encontrado${
                      totalResults === 1 ? "" : "s"
                    }`
                  : "Busca personas, contenido, carpetas, equipos o cursos."}
            </p>
          </div>

          <div className="mb-6 flex gap-2 overflow-x-auto pb-1 md:hidden">
            {FILTER_OPTIONS.map((option) => {
              const Icon = option.icon;
              const isSelected = selectedFilters.includes(option.id);

              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => toggleFilter(option.id)}
                  className={[
                    "inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
                    isSelected
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-background text-muted-foreground hover:bg-muted",
                  ].join(" ")}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {option.label}
                </button>
              );
            })}
          </div>

          {isLoading ? (
            <SearchLoadingState />
          ) : hasResults ? (
            <div className="space-y-8">
              {grouped.map((group) => {
                const category = CATEGORY_CONFIG[group.category];
                const GroupIcon = category?.icon ?? Search;
                const groupLabel = category?.label ?? group.label;

                return (
                  <section
                    key={group.category}
                    aria-labelledby={`search-group-${group.category}`}
                  >
                    <div className="mb-3 flex items-center justify-between border-b border-border pb-3">
                      <div className="flex items-center gap-2.5">
                        <GroupIcon className="h-4 w-4 text-muted-foreground" />

                        <h2
                          id={`search-group-${group.category}`}
                          className="text-sm font-semibold text-foreground"
                        >
                          {groupLabel}
                        </h2>
                      </div>

                      <span className="text-xs tabular-nums text-muted-foreground">
                        {group.results.length} resultado
                        {group.results.length === 1 ? "" : "s"}
                      </span>
                    </div>

                    <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                      {group.results.map((result) => {
                        const content = (
                          <SearchResultItem {...result} />
                        );

                        if (!result.url) {
                          return (
                            <div
                              key={`${group.category}-${result.id}`}
                              className="px-1"
                            >
                              {content}
                            </div>
                          );
                        }

                        return (
                          <Link
                            key={`${group.category}-${result.id}`}
                            href={result.url}
                            className="block px-1 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                          >
                            {content}
                          </Link>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            <SearchEmptyState
              query={query}
              hasFilters={hasFilters}
              onClearFilters={() => setSelectedFilters([])}
            />
          )}
        </div>
      </main>
    </div>
  );
}

function SearchLoadingState() {
  return (
    <div
      className="space-y-8"
      aria-label="Cargando resultados"
    >
      {[0, 1].map((section) => (
        <div key={section}>
          <div className="mb-3 flex items-center justify-between border-b border-border pb-3">
            <div className="h-4 w-28 animate-pulse rounded bg-muted" />
            <div className="h-3 w-16 animate-pulse rounded bg-muted" />
          </div>

          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {[0, 1, 2].map((row) => (
              <div
                key={row}
                className="flex items-center gap-4 px-4 py-4"
              >
                <div className="h-10 w-10 shrink-0 animate-pulse rounded-lg bg-muted" />

                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface SearchEmptyStateProps {
  query: string;
  hasFilters: boolean;
  onClearFilters: () => void;
}

function SearchEmptyState({
  query,
  hasFilters,
  onClearFilters,
}: SearchEmptyStateProps) {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center px-6 text-center">
      <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-muted/30">
        <Search className="h-5 w-5 text-muted-foreground" />
      </div>

      <h2 className="text-base font-semibold text-foreground">
        {query
          ? "No se encontraron resultados"
          : "Realiza una búsqueda"}
      </h2>

      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        {query
          ? `No hay coincidencias para “${query}”. Prueba con otros términos o modifica las categorías seleccionadas.`
          : "Introduce un nombre, título o término relacionado para buscar en toda la plataforma."}
      </p>

      {hasFilters && (
        <button
          type="button"
          onClick={onClearFilters}
          className="mt-5 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          Limpiar filtros
        </button>
      )}
    </div>
  );
}