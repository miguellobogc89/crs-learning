"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Clock,
  Zap,
  HelpCircle,
  ChevronRight,
  Loader2,
  Command,
} from "lucide-react";
import { useGlobalSearch } from "@/lib/hooks/use-global-search";
import { SearchResultItem } from "./search-result-item";

/**
 * Componente de búsqueda global con popover tipo Salesforce
 * Centraliza la navegación y búsqueda de toda la aplicación
 */
export function GlobalSearch() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  // Hook centralizado de búsqueda
  const {
    query,
    isLoading,
    results,
    recentSearches,
    quickAccess,
    selectedIndex,
    setQuery,
    clearQuery,
    resetSelectedIndex,
    selectNext,
    selectPrevious,
    getSelectedResult,
    addToHistory,
  } = useGlobalSearch();

  // Aplanar resultados para navegación por teclado
  const allResults = results?.groups.flatMap((g) => g.results) ?? [];

  /**
   * Manejo de atajos de teclado
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K o Cmd+K para abrir/cerrar
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen(!isOpen);
        if (!isOpen) {
          resetSelectedIndex();
        }
      }

      if (!isOpen) return;

      // Escape para cerrar
      if (e.key === "Escape") {
        e.preventDefault();
        setIsOpen(false);
        clearQuery();
      }

      // Navegación con flechas
      if (e.key === "ArrowDown") {
        e.preventDefault();
        selectNext();
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        selectPrevious();
      }

      // Enter para navegar
      if (e.key === "Enter") {
        e.preventDefault();
        const selectedResult = getSelectedResult();
        if (selectedResult?.url) {
          router.push(selectedResult.url);
          addToHistory(query);
          setIsOpen(false);
          clearQuery();
        } else if (query.trim()) {
          // Si no hay resultado seleccionado, ir a página de búsqueda
          router.push(`/search?q=${encodeURIComponent(query)}`);
          addToHistory(query);
          setIsOpen(false);
          clearQuery();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    isOpen,
    query,
    selectedIndex,
    allResults,
    router,
    getSelectedResult,
    addToHistory,
    clearQuery,
    resetSelectedIndex,
    selectNext,
    selectPrevious,
  ]);

  /**
   * Enfoca el input cuando se abre
   */
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  /**
   * Cierra al hacer click fuera
   */
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        clearQuery();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, clearQuery]);

  const showEmptyState = isOpen && !query.trim();

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      {/* Trigger Button */}
      <button
        onClick={() => {
          setIsOpen(true);
          resetSelectedIndex();
        }}
        className="group flex h-8 w-full items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground hover:border-foreground/20"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="hidden truncate text-left sm:inline">Buscar cualquier cosa...</span>
        <kbd className="ml-auto hidden rounded border border-border/50 bg-background px-1.5 py-0.5 text-xs font-medium sm:inline-flex gap-0.5">
          <Command className="h-3 w-3" />K
        </kbd>
      </button>

      {/* Popover */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 z-50 mt-2 w-full min-w-96 rounded-xl border border-border bg-background shadow-2xl">
          {/* Search Input Header */}
          <div className="border-b border-border/50 px-4 py-3">
            <div className="relative flex items-center">
              {isLoading ? (
                <Loader2 className="pointer-events-none absolute left-0 h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <Search className="pointer-events-none absolute left-0 h-4 w-4 text-muted-foreground" />
              )}
              <input
                ref={inputRef}
                type="text"
                placeholder="Usuarios, artículos, documentos..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  resetSelectedIndex();
                }}
                className="w-full bg-transparent pl-6 pr-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>

          {/* Content Area */}
          <div className="max-h-[450px] overflow-y-auto">
            {showEmptyState ? (
              <>
                {/* Recent Searches */}
                {recentSearches.length > 0 && (
                  <div className="border-b border-border/50 px-3 py-3">
                    <div className="mb-3 flex items-center gap-2 px-1">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <h3 className="text-xs font-semibold text-muted-foreground">
                        Búsquedas Recientes
                      </h3>
                    </div>
                    <div className="space-y-1">
                      {recentSearches.map((search) => (
                        <button
                          key={search.id}
                          onClick={() => {
                            setQuery(search.query);
                          }}
                          className="w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm text-foreground transition hover:bg-accent"
                        >
                          <span className="truncate">{search.query}</span>
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quick Access */}
                {quickAccess.length > 0 && (
                  <div className="border-b border-border/50 px-3 py-3">
                    <div className="mb-3 flex items-center gap-2 px-1">
                      <Zap className="h-4 w-4 text-muted-foreground" />
                      <h3 className="text-xs font-semibold text-muted-foreground">
                        Accesos Rápidos
                      </h3>
                    </div>
                    <div className="space-y-1">
                      {quickAccess.map((access) => (
                        <button
                          key={access.id}
                          onClick={() => {
                            router.push(access.url);
                            setIsOpen(false);
                            clearQuery();
                          }}
                          className="w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm text-foreground transition hover:bg-accent"
                        >
                          <span className="truncate">{access.title}</span>
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Help Tips */}
                <div className="px-4 py-3">
                  <div className="space-y-2 rounded-lg bg-accent/50 p-3">
                    <div className="flex items-start gap-2">
                      <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-foreground">
                          Consejos de búsqueda
                        </p>
                        <ul className="space-y-0.5 text-xs text-muted-foreground">
                          <li>
                            • Escribe para buscar en todas las categorías
                          </li>
                          <li>• Usa <kbd className="inline-flex rounded border border-border/30 bg-background/50 px-1 font-mono text-xs">↑↓</kbd> para navegar</li>
                          <li>• Presiona <kbd className="inline-flex rounded border border-border/30 bg-background/50 px-1 font-mono text-xs">Enter</kbd> para seleccionar</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : results && results.total > 0 ? (
              <div className="px-3 py-2">
                {results.groups.map((group) => (
                  <div key={group.category} className="mb-4 last:mb-0">
                    <h4 className="mb-2 px-1 text-xs font-semibold text-muted-foreground">
                      {group.label} ({group.results.length})
                    </h4>
                    <div className="space-y-1">
                      {group.results.map((result, idx) => {
                        // Calcular el índice global
                        const globalIdx =
                          results.groups
                            .slice(0, results.groups.indexOf(group))
                            .reduce((sum, g) => sum + g.results.length, 0) + idx;

                        return (
                          <button
                            key={result.id}
                            onClick={() => {
                              if (result.url) {
                                router.push(result.url);
                                addToHistory(query);
                                setIsOpen(false);
                                clearQuery();
                              }
                            }}
                            className="w-full text-left"
                          >
                            <SearchResultItem
                              {...result}
                              isSelected={globalIdx === selectedIndex}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : query.trim() && !isLoading ? (
              <div className="flex flex-col items-center justify-center py-12 px-4">
                <Search className="mb-3 h-8 w-8 text-muted-foreground/30" />
                <p className="text-sm font-medium text-foreground">
                  No se encontraron resultados
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  para "{query}"
                </p>
              </div>
            ) : isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : null}
          </div>

          {/* Footer Info */}
          {query.trim() && results && results.total > 0 && (
            <div className="border-t border-border/50 px-4 py-2 text-xs text-muted-foreground">
              {results.total} resultado{results.total !== 1 ? "s" : ""} encontrado{results.total !== 1 ? "s" : ""} en {results.executionTime.toFixed(0)}ms
            </div>
          )}
        </div>
      )}
    </div>
  );
}
