//app/actions/search.ts

"use server";

import { auth } from "@/auth";
import { SearchOrchestrator } from "@/lib/search/search.orchestrator";
import { initializeSearchProviders } from "@/lib/search/search.init";
import type {
  SearchContext,
  SearchResponse,
} from "@/lib/search/types";

// Inicializar providers una sola vez
let providersInitialized = false;

function ensureProvidersInitialized(): void {
  if (!providersInitialized) {
    initializeSearchProviders();
    providersInitialized = true;
  }
}

export interface SearchGlobalOptions {
  query: string;
  filters?: string[];
  limit?: number;
}

/**
 * Server Action: búsqueda global unificada.
 *
 * Flujo:
 * 1. Obtiene la sesión del usuario en el servidor.
 * 2. Valida que el usuario esté autenticado.
 * 3. Construye un contexto seguro de búsqueda.
 * 4. Ejecuta la búsqueda mediante los providers registrados.
 * 5. Devuelve únicamente los resultados autorizados.
 *
 * Ventajas:
 * - No requiere SessionProvider en el cliente.
 * - El userId nunca se recibe desde el cliente.
 * - Cada provider encapsula la lógica de su dominio.
 * - Añadir nuevos dominios no modifica el orquestador.
 */
export async function searchGlobal(
  options: SearchGlobalOptions
): Promise<SearchResponse> {
  const startTime = performance.now();
  const { query, filters, limit = 50 } = options;

  // La sesión se obtiene directamente en el servidor.
  const session = await auth();

  if (!session?.user?.id) {
    return {
      groups: [],
      total: 0,
      query,
      executionTime: performance.now() - startTime,
    };
  }

  if (!query.trim()) {
    return {
      groups: [],
      total: 0,
      query,
      executionTime: performance.now() - startTime,
    };
  }

  try {
    ensureProvidersInitialized();

    const context: SearchContext = {
      query,
      userId: session.user.id,
      limit,
    };

    return await SearchOrchestrator.search(context, filters);
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