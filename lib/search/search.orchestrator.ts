// lib/search/search.orchestrator.ts
/**
 * Orquestador de búsqueda modular
 *
 * Coordina los distintos Search Providers registrados
 * sin conocer cómo obtiene cada uno sus resultados.
 */

import type {
  SearchContext,
  SearchGroup,
  SearchProvider,
  SearchProviderRegistry,
  SearchResponse,
} from "./types";

class SearchProviderRegistryImpl implements SearchProviderRegistry {
  private providers = new Map<string, SearchProvider>();

  register(provider: SearchProvider): void {
    this.providers.set(provider.id, provider);
  }

  getProvider(id: string): SearchProvider | undefined {
    return this.providers.get(id);
  }

  getAllProviders(): SearchProvider[] {
    return Array.from(this.providers.values());
  }
}

// Registro global
const providerRegistry = new SearchProviderRegistryImpl();

export class SearchOrchestrator {
  /**
   * Registra un nuevo dominio de búsqueda.
   */
  static registerProvider(provider: SearchProvider): void {
    providerRegistry.register(provider);
  }

  /**
   * Ejecuta la búsqueda en todos los dominios registrados.
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
      let providers = providerRegistry.getAllProviders();

      if (filters?.length) {
        providers = providers.filter((provider) =>
          filters.includes(provider.category)
        );
      }

      const searchResults = await Promise.all(
        providers.map(async (provider) => {
          try {
            return {
              provider,
              results: await provider.search(context),
            };
          } catch (error) {
            console.error(
              `[SearchOrchestrator] Error searching with provider "${provider.id}"`,
              error
            );

            return {
              provider,
              results: [],
            };
          }
        })
      );

      const groups: SearchGroup[] = searchResults
        .filter((r) => r.results.length > 0)
        .map((r) => ({
          category: r.provider.category,
          label: r.provider.label,
          results: r.results,
        }));

      return {
        groups,
        total: groups.reduce((sum, g) => sum + g.results.length, 0),
        query,
        executionTime: performance.now() - startTime,
      };
    } catch (error) {
      console.error("[SearchOrchestrator]", error);

      return {
        groups: [],
        total: 0,
        query,
        executionTime: performance.now() - startTime,
      };
    }
  }

  /**
   * Información de los providers registrados.
   * Útil para debugging y herramientas internas.
   */
  static getProvidersInfo(): Array<{
    id: string;
    category: string;
    label: string;
  }> {
    return providerRegistry.getAllProviders().map((provider) => ({
      id: provider.id,
      category: provider.category,
      label: provider.label,
    }));
  }
}