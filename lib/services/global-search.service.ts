/**
 * Servicio de búsqueda global - DEPRECADO
 * 
 * Este archivo está en transición. La lógica de búsqueda ha sido migrada a:
 * - Server Action: app/actions/search.ts
 * - Orquestador: lib/search/search.orchestrator.ts
 * - Adaptadores: lib/search/adapters/
 * 
 * Este servicio solo mantiene funcionalidad cliente-side como historial
 * y accesos rápidos. La búsqueda real ocurre en el servidor.
 */

import type { RecentSearch, QuickAccess } from "@/types/search";

// Accesos rápidos estáticos (reales)
const QUICK_ACCESS: QuickAccess[] = [
  {
    id: "dashboard",
    title: "Dashboard",
    description: "Inicio rápido",
    icon: "grid",
    url: "/dashboard",
  },
  {
    id: "courses",
    title: "Mis Cursos",
    description: "Ver cursos disponibles",
    icon: "book-open",
    url: "/courses",
  },
  {
    id: "knowledge",
    title: "Base de Conocimiento",
    description: "Explorar documentos",
    icon: "lightbulb",
    url: "/knowledge",
  },
  {
    id: "my-space",
    title: "Mi Espacio",
    description: "Área personal",
    icon: "user",
    url: "/my-space",
  },
];

// Búsquedas recientes en memoria (futuro: guardar en BD)
const recentSearchesMap = new Map<string, RecentSearch>();

/**
 * Servicio de búsqueda global - Cliente
 * 
 * Nota: La búsqueda real ocurre en el servidor.
 * Este servicio solo gestiona datos cliente-side como
 * historial y accesos rápidos.
 */
export class GlobalSearchService {
  /**
   * Obtiene búsquedas recientes
   * @param limit Número máximo de búsquedas a retornar
   */
  static getRecentSearches(limit: number = 5): RecentSearch[] {
    // Retornar las búsquedas más recientes almacenadas en memoria
    const searches = Array.from(recentSearchesMap.values());
    return searches
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Obtiene accesos rápidos
   */
  static getQuickAccess(): QuickAccess[] {
    return QUICK_ACCESS;
  }

  /**
   * Obtiene todos los resultados disponibles (para página de búsqueda)
   * 
   * Nota: En el futuro esto podría ser una paginación
   * Por ahora retorna un array vacío hasta que se haga una búsqueda
   */
  static getAllResults(): SearchResult[] {
    // Retorna vacío - Los resultados vienen de la búsqueda en servidor
    return [];
  }

  /**
   * Agrega una búsqueda al historial en memoria
   * 
   * TODO: Persistir en BD cuando auth esté completamente implementado
   * @param query Término de búsqueda
   */
  static addToHistory(query: string): void {
    if (!query.trim()) return;

    const key = query.toLowerCase();
    const existing = recentSearchesMap.get(key);

    // Si ya existe, actualizar timestamp
    if (existing) {
      existing.timestamp = new Date();
    } else {
      // Si no existe, crear nueva entrada
      recentSearchesMap.set(key, {
        id: Math.random().toString(36).substring(7),
        query,
        timestamp: new Date(),
      });
    }

    // Mantener máximo 10 búsquedas en memoria
    if (recentSearchesMap.size > 10) {
      const sorted = Array.from(recentSearchesMap.values()).sort(
        (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
      );
      recentSearchesMap.delete(sorted[0].query.toLowerCase());
    }
  }
}

// Tipos re-exportados para compatibilidad (mantienen la interfaz pública)
import type { SearchResult } from "@/types/search";

export type { SearchResult };
