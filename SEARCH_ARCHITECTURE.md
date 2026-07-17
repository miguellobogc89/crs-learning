/**
 * ARQUITECTURA DE BÚSQUEDA MODULAR - GUÍA DEL DESARROLLADOR
 * 
 * Este documento explica cómo funciona la búsqueda global unificada
 * y cómo agregar nuevos módulos de búsqueda en el futuro.
 */

// ============================================================================
// 1. PRINCIPIOS ARQUITECTÓNICOS
// ============================================================================

/**
 * SEGURIDAD:
 * - El userId NUNCA se envía desde el cliente
 * - Se obtiene de la sesión en el servidor usando auth()
 * - Todos los permisos se validan en el backend
 * 
 * ESCALABILIDAD:
 * - Cada módulo es un "adaptador" independiente
 * - Agregar búsqueda en nuevos módulos NO requiere cambiar código existente
 * - El orquestador coordina todos los adaptadores automáticamente
 * 
 * DESACOPLAMIENTO:
 * - Frontend: Solo conoce el hook useGlobalSearch y el tipo SearchResponse
 * - Backend: Orquestador, adaptadores, tipos
 * - No hay dependencias cruzadas entre módulos
 */

// ============================================================================
// 2. FLUJO DE DATOS
// ============================================================================

/**
 * FLUJO ACTUAL:
 * 
 * CLIENTE (React Component)
 *   │
 *   ├─ useGlobalSearch(query)
 *   │   ├─ Estado: query, isLoading, results
 *   │   ├─ Caché: 300ms debounce, resultados cacheados
 *   │   └─ Keyboard nav: ↑↓ Enter Esc
 *   │
 *   └─ await searchGlobal({ query, filters })  ← Server Action
 *
 * SERVIDOR (Node.js)
 *   │
 *   ├─ searchGlobal() Server Action
 *   │   ├─ auth() → obtiene userId (AQUÍ, no del cliente)
 *   │   ├─ Valida autenticación
 *   │   └─ SearchOrchestrator.search()
 *   │
 *   ├─ SearchOrchestrator
 *   │   ├─ Obtiene todos los adaptadores registrados
 *   │   ├─ Ejecuta búsquedas EN PARALELO
 *   │   └─ Agrupa resultados por categoría
 *   │
 *   ├─ SearchAdapter (usuarios)
 *   ├─ SearchAdapter (courses)
 *   ├─ SearchAdapter (knowledge-sources)
 *   ├─ SearchAdapter (knowledge-libraries)
 *   ├─ SearchAdapter (knowledge-spaces)
 *   └─ SearchAdapter (knowledge-teams)
 *
 * CLIENTE (React Component)
 *   │
 *   └─ Renderiza resultados (ya filtrados por permisos)
 */

// ============================================================================
// 3. ESTRUCTURA DE DIRECTORIOS
// ============================================================================

/**
 * lib/search/
 *   ├─ types.ts                          ← Interfaces compartidas
 *   ├─ search.orchestrator.ts            ← Coordina adaptadores
 *   ├─ search.init.ts                    ← Registra adaptadores
 *   └─ adapters/
 *       ├─ users.adapter.ts              ← Búsqueda en usuarios
 *       ├─ courses.adapter.ts            ← Búsqueda en cursos
 *       ├─ knowledge-sources.adapter.ts  ← Búsqueda en documentos
 *       ├─ knowledge-libraries.adapter.ts
 *       ├─ knowledge-spaces.adapter.ts
 *       └─ knowledge-teams.adapter.ts
 * 
 * app/actions/search.ts                  ← Server action principal
 * lib/hooks/use-global-search.ts         ← Hook cliente (sin useSession)
 */

// ============================================================================
// 4. CÓMO AGREGAR UN NUEVO MÓDULO DE BÚSQUEDA
// ============================================================================

/**
 * PASO 1: Crear el adaptador
 * Archivo: lib/search/adapters/chats.adapter.ts
 */

/*
import { prisma } from "@/lib/prisma";
import type { SearchAdapter, SearchContext, SearchResult } from "../types";

export const chatsSearchAdapter: SearchAdapter = {
  id: "chats",
  category: "chats",
  label: "💬 Chats",

  async search(context: SearchContext): Promise<SearchResult[]> {
    const { query, userId, limit = 10 } = context;

    try {
      const chats = await prisma.chats.findMany({
        where: {
          // Filtros de visibilidad/permisos
          participants: {
            some: { user_id: userId }  ← Aquí se validan permisos!
          },
          OR: [
            { subject: { contains: query, mode: "insensitive" } },
            { preview: { contains: query, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          subject: true,
          preview: true,
          last_message_at: true,
        },
        take: limit,
      });

      return chats.map((chat) => ({
        id: chat.id,
        title: chat.subject,
        category: "chats" as const,
        description: chat.preview || "Chat",
        url: `/chats/${chat.id}`,
      }));
    } catch (error) {
      console.error("[SearchAdapter:chats] Error:", error);
      return [];
    }
  },
};
*/

/**
 * PASO 2: Registrar el adaptador
 * Archivo: lib/search/search.init.ts
 */

/*
import { chatsSearchAdapter } from "./adapters/chats.adapter";

export function initializeSearchAdapters(): void {
  // ... adaptadores existentes ...
  
  // Módulo: Chats
  SearchOrchestrator.registerAdapter(chatsSearchAdapter);
}
*/

/**
 * PASO 3: Agregar la categoría a los tipos
 * Archivo: lib/search/types.ts
 */

/*
export type SearchCategory =
  | "usuarios"
  | "articulos"
  | "documentos"
  | "bibliotecas"
  | "carpetas"
  | "equipos"
  | "chats"        ← NUEVA CATEGORÍA
  | string;
*/

/**
 * PASO 4: Agregar el filtro en UI (opcional)
 * Archivo: components/search/global-search.tsx
 * o app/(app)/search/page.tsx
 */

/*
const FILTER_OPTIONS = [
  { id: "usuarios", label: "👥 Usuarios" },
  { id: "articulos", label: "💡 Artículos" },
  // ...
  { id: "chats", label: "💬 Chats" },  ← NUEVO
];
*/

/**
 * ¡LISTO! El nuevo módulo está integrado.
 * 
 * Automáticamente:
 * - Se ejecutará en paralelo con otros módulos
 * - Se filtrarán los resultados por permisos
 * - Se mostrarán en la UI del buscador
 * - Se cacheará correctamente
 * 
 * NO hay que modificar:
 * - app/actions/search.ts (¡La llamada a searchGlobal NO cambia!)
 * - lib/hooks/use-global-search.ts (¡El hook NO cambia!)
 * - SearchOrchestrator (¡Ya sabe cómo coordinar!)
 */

// ============================================================================
// 5. IMPORTANTE: FILTRADO POR PERMISOS
// ============================================================================

/**
 * CADA ADAPTADOR ES RESPONSABLE DE VALIDAR PERMISOS
 * 
 * El userId se pasa en el contexto. Los adaptadores deben usarlo para:
 * - Filtrar por visibilidad
 * - Validar membership en equipos/espacios
 * - Respetar permisos de propietario
 * 
 * Ejemplo: En knowledge-spaces.adapter.ts
 * 
 * async search(context: SearchContext): Promise<SearchResult[]> {
 *   const { query, userId, limit } = context;
 *   
 *   const spaces = await prisma.knowledge_spaces.findMany({
 *     where: {
 *       // Filtro de permisos: solo espacios visibles para este usuario
 *       OR: [
 *         { visibility: "public" },
 *         { visibility: "restricted", members: { some: { user_id: userId } } },
 *         { owner_id: userId },  // El dueño siempre ve sus propios espacios
 *       ],
 *       // Búsqueda por término
 *       name: { contains: query, mode: "insensitive" }
 *     },
 *     // ...
 *   });
 * }
 * 
 * IMPORTANTE:
 * - No envíes userId desde el cliente para "truquear"
 * - La validación DEBE ocurrir en el servidor
 * - Usa la sesión server-side para validar identidad
 */

// ============================================================================
// 6. TESTING
// ============================================================================

/**
 * Para probar la búsqueda:
 * 
 * 1. En el navegador:
 *    - Ctrl+K (o Cmd+K en Mac) para abrir el buscador
 *    - Tipea cualquier término
 *    - Observa que se busca en TODOS los módulos
 *    - Solo ves resultados a los que tienes acceso
 * 
 * 2. Verifica que NO aparezcan:
 *    - Documentos privados que no te pertenecen
 *    - Espacios cerrados donde no eres miembro
 *    - Equipos privados donde no estás
 * 
 * 3. Debugging:
 *    - Abre DevTools → Console
 *    - En app/actions/search.ts hay console.log en cada adaptador
 *    - Revisa que searchGlobal() obtenga la sesión correctamente
 */

// ============================================================================
// 7. PERFORMANCE
// ============================================================================

/**
 * OPTIMIZACIONES IMPLEMENTADAS:
 * 
 * 1. Búsquedas paralelas:
 *    - Todos los adaptadores se ejecutan simultáneamente
 *    - No se esperan secuencialmente
 *    - Promise.all() coordina todas
 * 
 * 2. Caché en cliente:
 *    - Resultados para el mismo query se cachean
 *    - Evita rebuscar si el usuario borra y retipea
 * 
 * 3. Debounce:
 *    - 300ms de espera antes de buscar
 *    - Evita búsquedas en cada keystroke
 * 
 * 4. Límites por adaptador:
 *    - Cada adaptador retorna máximo 10 resultados
 *    - El total es máximo 50 (aproximadamente 10 por módulo)
 * 
 * 5. Índices de BD:
 *    - Asegúrate que haya índices en los campos searchables:
 *    - users.name, users.email
 *    - courses.title, courses.description
 *    - knowledge_sources.title, knowledge_sources.description
 *    - etc.
 */

// ============================================================================
// 8. SEGURIDAD - PUNTOS CRÍTICOS
// ============================================================================

/**
 * ✅ HECHO CORRECTAMENTE:
 * - userId se obtiene de auth() en el servidor
 * - Permisos se validan en cada adaptador
 * - No hay filtrado cliente-side (inseguro)
 * 
 * ❌ NO HACER:
 * - Pasar userId desde el cliente: await searchGlobal({ query, userId })
 * - Usar useSession() para validar acceso
 * - Confiar en datos client-side para filtrar
 * - Enviar contraseñas o datos sensibles en resultados
 * 
 * RECUERDA:
 * - El servidor es la fuente de verdad
 * - Los clientes pueden ser modificados
 * - Toda validación de seguridad ocurre en el servidor
 */

// ============================================================================
// 9. PRÓXIMOS PASOS (Opcional)
// ============================================================================

/**
 * Cuando la aplicación escale:
 * 
 * 1. INDEXACIÓN FULL-TEXT:
 *    - Usar PostgreSQL FTS (Full-Text Search)
 *    - O Elasticsearch si necesitas búsqueda avanzada
 * 
 * 2. CACHÉ DISTRIBUIDA:
 *    - Redis para resultados frecuentes
 *    - TTL: 5-10 minutos
 * 
 * 3. ANALYTICS:
 *    - Rastrear búsquedas populares
 *    - Mejorar UX basado en patrones
 * 
 * 4. PERMISOS AVANZADOS:
 *    - Integrar con sistema de roles/permisos si existe
 *    - Multi-tenancy si es necesario
 * 
 * 5. BÚSQUEDA FACETADA:
 *    - Filtros por rango de fechas
 *    - Filtros por tipo de contenido
 *    - Orden por relevancia/fecha/popularidad
 */

// ============================================================================
// RESUMEN: LÍNEA DE TIEMPO
// ============================================================================

/**
 * SESIÓN 1 (Anterior):
 * ✅ Implementación con datos mock
 * ✅ UI Spotlight/Popover
 * ✅ Búsqueda en 6 módulos
 * 
 * SESIÓN 2 (Anterior):
 * ✅ Conexión a datos reales (BD)
 * ✅ Server action con 6 adaptadores
 * ✅ Eliminación de mocks
 * 
 * SESIÓN 3 (ESTA):
 * ✅ Refactorización arquitectónica
 * ✅ Eliminación de useSession() del cliente
 * ✅ Autenticación server-only
 * ✅ Sistema modular con registro de adaptadores
 * ✅ Preparado para escalabilidad futura
 * ✅ Seguridad mejorada
 * 
 * RESULTADO FINAL:
 * - Arquitectura limpia, modular, escalable
 * - Seguridad por defecto (permisos en servidor)
 * - Fácil de mantener y extender
 * - Desacoplamiento total entre módulos
 */
