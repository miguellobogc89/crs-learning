"use client";

import { useCallback, useState, useRef, useEffect } from "react";
import { searchGlobal } from "@/app/actions/search";
import type { SearchResponse } from "@/lib/search/types";
import type { RecentSearch, QuickAccess } from "@/types/search";
import { GlobalSearchService } from "@/lib/services/global-search.service";

interface UseGlobalSearchReturn {
  // Estado
  query: string;
  isLoading: boolean;
  results: SearchResponse | null;
  recentSearches: RecentSearch[];
  quickAccess: QuickAccess[];
  selectedIndex: number;

  // Métodos
  setQuery: (query: string) => void;
  search: (query: string) => Promise<void>;
  clearQuery: () => void;
  resetSelectedIndex: () => void;
  selectNext: () => void;
  selectPrevious: () => void;
  getSelectedResult: () => any;
  addToHistory: (query: string) => void;
}

/**
 * Hook centralizado para búsqueda global
 * 
 * ✅ ARQUITECTURA LIMPIA:
 * - No usa useSession() (no requiere SessionProvider en cliente)
 * - userId se obtiene automáticamente en el servidor
 * - Todos los permisos y filtros se aplican en el backend
 * - El cliente solo envía el query y renderiza resultados
 * 
 * FLUJO:
 * Cliente: useGlobalSearch(query)
 *   ↓
 * Server Action: searchGlobal(query)
 *   ↓
 * Servidor: auth() → obtiene userId
 *   ↓
 * Servidor: Aplica permisos y ejecuta búsqueda
 *   ↓
 * Cliente: Renderiza resultados seguros
 */
export function useGlobalSearch(): UseGlobalSearchReturn {
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const [quickAccess, setQuickAccess] = useState<QuickAccess[]>([]);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const cacheRef = useRef<Map<string, SearchResponse>>(new Map());

  // Inicializar datos estáticos
  useEffect(() => {
    setRecentSearches(GlobalSearchService.getRecentSearches());
    setQuickAccess(GlobalSearchService.getQuickAccess());
  }, []);

  /**
   * Realiza la búsqueda en el servidor
   * El userId se obtiene automáticamente en el servidor
   */
  const search = useCallback(async (searchQuery: string) => {
    // Limpiar búsquedas previas si la consulta está vacía
    if (!searchQuery.trim()) {
      setResults(null);
      setSelectedIndex(0);
      return;
    }

    // Verificar caché
    if (cacheRef.current.has(searchQuery)) {
      setResults(cacheRef.current.get(searchQuery) || null);
      setSelectedIndex(0);
      return;
    }

    // Realizar búsqueda en el servidor
    setIsLoading(true);
    try {
      // El servidor obtiene la sesión y aplica permisos
      const response = await searchGlobal({
        query: searchQuery,
        limit: 50,
      });

      setResults(response);
      cacheRef.current.set(searchQuery, response);
      setSelectedIndex(0);
    } catch (error) {
      console.error("Search error:", error);
      setResults(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Handler de cambio con debounce
   */
  const handleSetQuery = useCallback(
    (newQuery: string) => {
      setQuery(newQuery);

      // Limpiar debounce anterior
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }

      // Debounce la búsqueda
      debounceTimer.current = setTimeout(() => {
        search(newQuery);
      }, 300);
    },
    [search]
  );

  /**
   * Limpia la búsqueda
   */
  const clearQuery = useCallback(() => {
    setQuery("");
    setResults(null);
    setSelectedIndex(0);
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
  }, []);

  /**
   * Resetea el índice seleccionado
   */
  const resetSelectedIndex = useCallback(() => {
    setSelectedIndex(0);
  }, []);

  /**
   * Selecciona el siguiente resultado
   */
  const selectNext = useCallback(() => {
    if (!results) return;

    const totalResults = results.groups.reduce(
      (sum, group) => sum + group.results.length,
      0
    );

    setSelectedIndex((prev) => (prev < totalResults - 1 ? prev + 1 : prev));
  }, [results]);

  /**
   * Selecciona el resultado anterior
   */
  const selectPrevious = useCallback(() => {
    setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
  }, []);

  /**
   * Obtiene el resultado seleccionado actualmente
   */
  const getSelectedResult = useCallback(() => {
    if (!results) return null;

    let currentIndex = 0;
    for (const group of results.groups) {
      for (const result of group.results) {
        if (currentIndex === selectedIndex) {
          return result;
        }
        currentIndex++;
      }
    }
    return null;
  }, [results, selectedIndex]);

  /**
   * Agrega una búsqueda al historial
   */
  const addToHistory = useCallback((searchQuery: string) => {
    GlobalSearchService.addToHistory(searchQuery);
  }, []);

  return {
    query,
    isLoading,
    results,
    recentSearches,
    quickAccess,
    selectedIndex,
    setQuery: handleSetQuery,
    search,
    clearQuery,
    resetSelectedIndex,
    selectNext,
    selectPrevious,
    getSelectedResult,
    addToHistory,
  };
}
