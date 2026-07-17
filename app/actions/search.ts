"use server";

import { auth } from "@/auth";
import { SearchOrchestrator } from "@/lib/search/search.orchestrator";
import { initializeSearchAdapters } from "@/lib/search/search.init";
import type {
  SearchResult,
  SearchResponse,
  SearchContext,
} from "@/lib/search/types";

// Inicializar adaptadores una sola vez
let adaptersInitialized = false;
function ensureAdaptersInitialized(): void {
  if (!adaptersInitialized) {
    initializeSearchAdapters();
    adaptersInitialized = true;
  }
}

export interface SearchGlobalOptions {
  query: string;
  filters?: string[];
  limit?: number;
}

/**
 * Server Action: Búsqueda global unificada
 * 
 * Flujo:
 * 1. Obtiene la sesión del usuario del servidor (sin enviarla desde cliente)
 * 2. Valida que el usuario esté autenticado
 * 3. Ejecuta búsquedas en múltiples módulos usando adaptadores
 * 4. Los adaptadores aplican filtros de visibilidad por módulo
 * 5. Retorna solo los resultados a los que el usuario puede acceder
 * 
 * Ventajas:
 * - No requiere SessionProvider en el cliente
 * - La autorización es segura (validada en servidor)
 * - Escalable: agregar nuevos módulos es solo agregar un adaptador
 * - Desacoplado: cada módulo es independiente
 */
export async function searchGlobal(
  options: SearchGlobalOptions
): Promise<SearchResponse> {
  const startTime = performance.now();
  const { query, filters, limit = 50 } = options;

  // Obtener la sesión del usuario del servidor
  // No viene del cliente, se obtiene directamente en el servidor
  const session = await auth();

  // Validar que el usuario esté autenticado
  if (!session?.user?.id) {
    return {
      groups: [],
      total: 0,
      query,
      executionTime: performance.now() - startTime,
    };
  }

  // Validar que la búsqueda no esté vacía
  if (!query.trim()) {
    return {
      groups: [],
      total: 0,
      query,
      executionTime: performance.now() - startTime,
    };
  }

  try {
    // Asegurar que los adaptadores estén inicializados
    ensureAdaptersInitialized();

    // Contexto de búsqueda (userId viene del servidor, no del cliente)
    const context: SearchContext = {
      query,
      userId: session.user.id,
      limit,
    };

    // Ejecutar búsqueda usando el orquestador
    // El orquestador coordina todos los adaptadores registrados
    const response = await SearchOrchestrator.search(context, filters);

    return response;
  } catch (error) {
    console.error("[searchGlobal] Error:", error);
    return {
      groups: [],
      total: 0,
      query,
      executionTime: performance.now() - startTime,
    };
  }
}
