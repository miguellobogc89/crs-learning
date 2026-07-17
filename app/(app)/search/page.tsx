"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchResultItem } from "@/components/search/search-result-item";
import { searchGlobal } from "@/app/actions/search";
import type { SearchGroup } from "@/lib/search/types";

const FILTER_OPTIONS = [
  { id: "usuarios", label: "👥 Usuarios" },
  { id: "articulos", label: "💡 Artículos" },
  { id: "documentos", label: "📄 Documentos" },
  { id: "bibliotecas", label: "📚 Bibliotecas" },
  { id: "carpetas", label: "📁 Carpetas" },
  { id: "equipos", label: "🏢 Equipos" },
];

export default function SearchPage() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") || "";
  const [selectedFilters, setSelectedFilters] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [grouped, setGrouped] = useState<SearchGroup[]>([]);
  const [totalResults, setTotalResults] = useState(0);

  // Realizar búsqueda en BD
  useEffect(() => {
    if (!query.trim()) {
      setGrouped([]);
      setTotalResults(0);
      return;
    }

    const performSearch = async () => {
      setIsLoading(true);
      try {
        const response = await searchGlobal({
          query,
          filters: selectedFilters.length > 0 ? selectedFilters : undefined,
        });

        setGrouped(response.groups);
        setTotalResults(response.total);
      } catch (error) {
        console.error("Search error:", error);
        setGrouped([]);
        setTotalResults(0);
      } finally {
        setIsLoading(false);
      }
    };

    performSearch();
  }, [query, selectedFilters]);

  const toggleFilter = (filterId: string) => {
    setSelectedFilters((prev) =>
      prev.includes(filterId)
        ? prev.filter((f) => f !== filterId)
        : [...prev, filterId]
    );
  };

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="border-b border-border bg-background px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold text-foreground mb-1">
            Resultados de búsqueda
          </h1>
          <p className="text-sm text-muted-foreground">
            {isLoading ? (
              <span className="inline-flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-muted-foreground animate-pulse"></span>
                Buscando...
              </span>
            ) : (
              <>
                {totalResults} resultado{totalResults !== 1 ? "s" : ""} para "{query}"
              </>
            )}
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Sidebar - Filters */}
        <aside className="w-64 border-r border-border bg-muted/30 overflow-y-auto">
          <div className="p-4">
            <h3 className="mb-4 text-sm font-semibold text-foreground">
              Filtrar por categoría
            </h3>
            <div className="space-y-2">
              {FILTER_OPTIONS.map((option) => {
                const count = grouped.find(
                  (g) => g.category === option.id
                )?.results.length || 0;

                return (
                  <label
                    key={option.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-background"
                  >
                    <Checkbox
                      checked={selectedFilters.includes(option.id)}
                      onCheckedChange={() => toggleFilter(option.id)}
                    />
                    <span className="flex-1 text-sm text-foreground">
                      {option.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {count}
                    </span>
                  </label>
                );
              })}
            </div>

            {/* Clear Filters */}
            {selectedFilters.length > 0 && (
              <button
                onClick={() => setSelectedFilters([])}
                className="mt-4 w-full rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-accent"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        </aside>

        {/* Results */}
        <main className="flex-1 overflow-y-auto">
          {grouped.length > 0 ? (
            <div className="mx-auto max-w-4xl px-6 py-8">
              {grouped.map((group) => (
                <section key={group.category} className="mb-10 last:mb-0">
                  <h2 className="mb-4 text-lg font-semibold text-foreground">
                    {group.label}
                  </h2>
                  <div className="space-y-2">
                    {group.results.map((result) => (
                      <a
                        key={result.id}
                        href={result.url || "#"}
                        className="block"
                      >
                        <SearchResultItem {...result} />
                      </a>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4">
              <div className="text-6xl">🔍</div>
              <h3 className="text-lg font-semibold text-foreground">
                No se encontraron resultados
              </h3>
              <p className="text-sm text-muted-foreground">
                Intenta con otros términos de búsqueda o ajusta los filtros
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

import React from "react";
