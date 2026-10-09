// components/search/global-search.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, Command } from "lucide-react";
import { useGlobalSearch } from "@/lib/hooks/use-global-search";
import { SearchResultItem } from "./search-result-item";

/**
 * Componente de búsqueda global con popover tipo Salesforce.
 * El desplegable solo aparece cuando el usuario escribe y hay coincidencias.
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

  // El popover solo se muestra si hay texto escrito Y hay coincidencias
  const hasQuery = query.trim().length > 0;
  const hasResults = !!results && results.total > 0;
  const showPopover = isOpen && hasQuery && hasResults;

  /**
   * Cierra el buscador y limpia el estado
   */
  const closeAndReset = () => {
    setIsOpen(false);
    clearQuery();
  };

  /**
   * Manejo de atajos de teclado
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K o Cmd+K para enfocar/desenfocar
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (document.activeElement === inputRef.current) {
          inputRef.current?.blur();
          setIsOpen(false);
        } else {
          inputRef.current?.focus();
          setIsOpen(true);
          resetSelectedIndex();
        }
        return;
      }

      if (!isOpen) return;

      // Escape para cerrar
      if (e.key === "Escape") {
        e.preventDefault();
        closeAndReset();
        inputRef.current?.blur();
        return;
      }

      // Navegación con flechas (solo si el desplegable está visible)
      if (e.key === "ArrowDown" && showPopover) {
        e.preventDefault();
        selectNext();
        return;
      }

      if (e.key === "ArrowUp" && showPopover) {
        e.preventDefault();
        selectPrevious();
        return;
      }

      // Enter para navegar
      if (e.key === "Enter" && hasQuery) {
        e.preventDefault();
        const selectedResult = showPopover ? getSelectedResult() : null;

        if (selectedResult?.url) {
          router.push(selectedResult.url);
        } else {
          // Si no hay resultado seleccionado, ir a la página de búsqueda
          router.push(`/search?q=${encodeURIComponent(query)}`);
        }
        addToHistory(query);
        closeAndReset();
        inputRef.current?.blur();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isOpen,
    showPopover,
    hasQuery,
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
   * Cierra al hacer click fuera
   */
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        closeAndReset();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, clearQuery]);

  return (
    <div ref={containerRef} className="relative h-full w-full">
      {/* Campo de búsqueda */}
      <div
        // Al hacer click en cualquier parte de la barra, se enfoca el input
        onMouseDown={(e) => {
          if (e.target !== inputRef.current) {
            e.preventDefault();
            inputRef.current?.focus();
          }
        }}
        className="
          flex h-full w-full min-w-0
          cursor-text items-center gap-4
          rounded-[18px]
          border border-[#E7EDFA]
          bg-white px-[22px]
          shadow-none
          transition-colors duration-150
          focus-within:border-black
          focus-within:ring-1
          focus-within:ring-black
        "
      >
        {isLoading ? (
          <Loader2 className="size-icon-lg shrink-0 animate-spin text-[#91A1BB]" />
        ) : (
          <Search
            className="size-icon-lg shrink-0 text-[#91A1BB]"
            strokeWidth={1.8}
          />
        )}

        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label="Búsqueda global"
          aria-expanded={showPopover}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder="Buscar documentos, carpetas, etiquetas..."
          value={query}
          onFocus={() => {
            setIsOpen(true);
            resetSelectedIndex();
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            resetSelectedIndex();
            setIsOpen(true);
          }}
          className="
            h-full min-w-0 flex-1
            cursor-text bg-transparent
            text-body-small text-foreground
            outline-none
            placeholder:text-[#8492AA]
          "
        />

        <kbd
          data-search-shortcut
          className="
            pointer-events-none ml-auto inline-flex
            h-[30px] shrink-0
            items-center justify-center gap-1.5
            rounded-[9px] border border-[#E7EDFA]
            bg-white px-2.5 text-caption
            font-medium text-[#8492AA]
          "
        >
          <Command className="size-[13px]" strokeWidth={1.6} />
          <span>K</span>
        </kbd>
      </div>

      {/* Popover: solo con texto escrito y coincidencias */}
      {showPopover && results && (
        <div
          className="
            absolute left-0 right-0 top-full z-[100]
            mt-2 w-full min-w-[min(24rem,calc(100vw-2rem))]
            overflow-hidden rounded-[18px]
            border border-[#E7EDFA]
            bg-white text-[#17243B]
            shadow-[0_18px_55px_rgba(25,48,100,0.16)]
          "
        >
          {/* Resultados */}
          <div className="max-h-[450px] overflow-y-auto px-3 py-2">
            {results.groups.map((group, groupIdx) => {
              // Índice global donde empieza este grupo
              const offset = results.groups
                .slice(0, groupIdx)
                .reduce((sum, g) => sum + g.results.length, 0);

              return (
                <div key={group.category} className="mb-4 last:mb-0">
                  <h4 className="mb-2 px-1 text-caption font-semibold text-muted-foreground">
                    {group.label} ({group.results.length})
                  </h4>
                  <div className="space-y-1">
                    {group.results.map((result, idx) => (
                      <button
                        key={result.id}
                        type="button"
                        // Evita que el input pierda el foco al hacer click
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          if (result.url) {
                            router.push(result.url);
                            addToHistory(query);
                            closeAndReset();
                            inputRef.current?.blur();
                          }
                        }}
                        className="w-full text-left"
                      >
                        <SearchResultItem
                          {...result}
                          isSelected={offset + idx === selectedIndex}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer Info */}
          <div className="border-t border-border/50 px-4 py-2 text-caption text-muted-foreground">
            {results.total} resultado{results.total !== 1 ? "s" : ""} encontrado
            {results.total !== 1 ? "s" : ""} en{" "}
            {results.executionTime.toFixed(0)}ms
          </div>
        </div>
      )}
    </div>
  );
}