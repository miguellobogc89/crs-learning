/**
 * Orquestador de búsqueda modular
 * Coordina múltiples adaptadores y aplica lógica central
 * 
 * Flujo:
 * 1. Registra todos los adaptadores disponibles
 * 2. Ejecuta búsquedas en paralelo en todos los módulos
 * 3. Aplica filtros y permisos
 * 4. Agrupa resultados por categoría
 * 5. Retorna respuesta formateada
 */

import type {
  SearchAdapter,
  SearchAdapterRegistry,
  SearchContext,
  SearchGroup,
  SearchResponse,
  SearchResult,
} from "./types";

class SearchAdapterRegistryImpl implements SearchAdapterRegistry {
  private adapters: Map<string, SearchAdapter> = new Map();

  register(adapter: SearchAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  getAdapter(id: string): SearchAdapter | undefined {
    return this.adapters.get(id);
  }

  getAllAdapters(): SearchAdapter[] {
    return Array.from(this.adapters.values());
  }
}

// Instancia global del registro
const adapterRegistry = new SearchAdapterRegistryImpl();

/**
 * Orquestador de búsqueda
 * Punto central para coordinar búsquedas en múltiples módulos
 */
export class SearchOrchestrator {
  /**
   * Registra un nuevo adaptador de búsqueda
   * @param adapter Adaptador que implementa la interfaz SearchAdapter
   * 
   * Ejemplo:
   * ```
   * SearchOrchestrator.registerAdapter(usersSearchAdapter);
   * SearchOrchestrator.registerAdapter(coursesSearchAdapter);
   * ```
   */
  static registerAdapter(adapter: SearchAdapter): void {
    adapterRegistry.register(adapter);
  }

  /**
   * Ejecuta búsqueda en todos los adaptadores registrados
   * Aplica filtros y permisos en el servidor
   * 
   * @param context Contexto de búsqueda (query, userId, limit)
   * @param filters Categorías específicas a buscar (si no se especifican, busca en todas)
   * @returns Respuesta agrupada por categoría
   */
  static async search(
    context: SearchContext,
    filters?: string[]
  ): Promise<SearchResponse> {
    const startTime = performance.now();
    const { query } = context;

    if (!query.trim()) {
      return {
        groups: [],
        total: 0,
        query,
        executionTime: performance.now() - startTime,
      };
    }

    try {
      // Obtener adaptadores a usar
      let adaptersToUse = adapterRegistry.getAllAdapters();

      // Filtrar por categorías si se especifican
      if (filters && filters.length > 0) {
        adaptersToUse = adaptersToUse.filter((adapter) =>
          filters.includes(adapter.category)
        );
      }

      // Ejecutar búsquedas en paralelo
      const searchPromises = adaptersToUse.map((adapter) =>
        adapter
          .search(context)
          .then((results) => ({
            adapter,
            results,
          }))
          .catch((error) => {
            console.error(
              `[SearchOrchestrator] Error searching with adapter ${adapter.id}:`,
              error
            );
            return {
              adapter,
              results: [],
            };
          })
      );

      const searchResults = await Promise.all(searchPromises);

      // Agrupar resultados por categoría
      const groups: SearchGroup[] = searchResults
        .filter((r) => r.results.length > 0)
        .map((r) => ({
          category: r.adapter.category,
          label: r.adapter.label,
          results: r.results,
        }));

      // Calcular total de resultados
      const total = groups.reduce((sum, group) => sum + group.results.length, 0);

      const executionTime = performance.now() - startTime;

      return {
        groups,
        total,
        query,
        executionTime,
      };
    } catch (error) {
      console.error("[SearchOrchestrator] Unexpected error:", error);
      return {
        groups: [],
        total: 0,
        query,
        executionTime: performance.now() - startTime,
      };
    }
  }

  /**
   * Obtiene información sobre los adaptadores registrados
   * Útil para debugging y UI
   */
  static getAdaptersInfo(): Array<{ id: string; category: string; label: string }> {
    return adapterRegistry.getAllAdapters().map((adapter) => ({
      id: adapter.id,
      category: adapter.category,
      label: adapter.label,
    }));
  }
}
