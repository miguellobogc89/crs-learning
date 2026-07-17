/**
 * EJEMPLOS PRÁCTICOS: AGREGAR NUEVOS MÓDULOS DE BÚSQUEDA
 * 
 * Este archivo muestra ejemplos completos de cómo extender
 * el sistema de búsqueda con nuevos módulos.
 */

// ============================================================================
// EJEMPLO 1: AGREGAR BÚSQUEDA DE CHATS
// ============================================================================

/**
 * PASO 1: Crear adaptador
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
      // Buscar chats donde el usuario es participante
      const chats = await prisma.chats.findMany({
        where: {
          // IMPORTANTE: Filtrar por permisos usando userId del servidor
          participants: {
            some: { user_id: userId }  ← Usuario DEBE ser participante
          },
          // Búsqueda por texto
          OR: [
            { subject: { contains: query, mode: "insensitive" } },
            { description: { contains: query, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          subject: true,
          description: true,
          updated_at: true,
          participants: {
            select: { user_id: true },
            take: 5,
          },
        },
        take: limit,
        orderBy: { updated_at: "desc" },
      });

      return chats.map((chat) => ({
        id: chat.id,
        title: chat.subject,
        category: "chats" as const,
        description:
          chat.description ||
          `${chat.participants.length} participantes`,
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
 * PASO 2: Registrar en search.init.ts
 */

/*
// Archivo: lib/search/search.init.ts
import { chatsSearchAdapter } from "./adapters/chats.adapter";

export function initializeSearchAdapters(): void {
  // ... adaptadores existentes ...
  
  // Módulo: Chats ← NUEVO
  SearchOrchestrator.registerAdapter(chatsSearchAdapter);
}
*/

/**
 * PASO 3: Agregar categoría en tipos
 */

/*
// Archivo: lib/search/types.ts
export type SearchCategory =
  | "usuarios"
  | "articulos"
  | "documentos"
  | "bibliotecas"
  | "carpetas"
  | "equipos"
  | "chats"        ← NUEVO
  | string;

// Archivo: types/search.ts
export type SearchCategory =
  | "usuarios"
  | "articulos"
  | "documentos"
  | "bibliotecas"
  | "carpetas"
  | "equipos"
  | "chats"        ← NUEVO
  | string;
*/

/**
 * PASO 4: Agregar filtro en UI (opcional)
 */

/*
// Archivo: components/search/global-search.tsx
// o app/(app)/search/page.tsx

const FILTER_OPTIONS = [
  { id: "usuarios", label: "👥 Usuarios" },
  { id: "articulos", label: "💡 Artículos" },
  { id: "documentos", label: "📄 Documentos" },
  { id: "bibliotecas", label: "📚 Bibliotecas" },
  { id: "carpetas", label: "📁 Carpetas" },
  { id: "equipos", label: "🏢 Equipos" },
  { id: "chats", label: "💬 Chats" },  ← NUEVO
];
*/

/**
 * RESULTADO: ¡FUNCIONANDO!
 * 
 * ✅ Los chats aparecen en el buscador
 * ✅ Se ejecutan en paralelo con otros módulos
 * ✅ Solo ves chats donde eres participante
 * ✅ No requeriste modificar app/actions/search.ts
 * ✅ No requeriste modificar use-global-search.ts
 * ✅ Todo es modular y escalable
 */

// ============================================================================
// EJEMPLO 2: AGREGAR BÚSQUEDA DE NOTIFICACIONES
// ============================================================================

/**
 * Archivo: lib/search/adapters/notifications.adapter.ts
 */

/*
import { prisma } from "@/lib/prisma";
import type { SearchAdapter, SearchContext, SearchResult } from "../types";

export const notificationsSearchAdapter: SearchAdapter = {
  id: "notifications",
  category: "notificaciones",
  label: "🔔 Notificaciones",

  async search(context: SearchContext): Promise<SearchResult[]> {
    const { query, userId, limit = 10 } = context;

    try {
      const notifications = await prisma.notifications.findMany({
        where: {
          // Filtro: solo notificaciones del usuario
          recipient_id: userId,  ← userId del servidor
          
          // Búsqueda
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { message: { contains: query, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          title: true,
          message: true,
          type: true,
          read: true,
          created_at: true,
        },
        take: limit,
        orderBy: { created_at: "desc" },
      });

      return notifications.map((notif) => ({
        id: notif.id,
        title: notif.title,
        category: "notificaciones" as const,
        description:
          notif.message || `Tipo: ${notif.type}`,
        url: `/notifications/${notif.id}`,
        metadata: {
          read: notif.read,
          type: notif.type,
        },
      }));
    } catch (error) {
      console.error("[SearchAdapter:notifications] Error:", error);
      return [];
    }
  },
};
*/

// ============================================================================
// EJEMPLO 3: AGREGAR BÚSQUEDA DE PROYECTOS (Si existen en BD)
// ============================================================================

/**
 * Archivo: lib/search/adapters/projects.adapter.ts
 */

/*
import { prisma } from "@/lib/prisma";
import type { SearchAdapter, SearchContext, SearchResult } from "../types";

export const projectsSearchAdapter: SearchAdapter = {
  id: "projects",
  category: "proyectos",
  label: "📊 Proyectos",

  async search(context: SearchContext): Promise<SearchResult[]> {
    const { query, userId, limit = 10 } = context;

    try {
      const projects = await prisma.projects.findMany({
        where: {
          // Filtro: proyectos donde el usuario es miembro o propietario
          OR: [
            { owner_id: userId },
            { members: { some: { user_id: userId } } },
          ],
          
          // Búsqueda
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { description: { contains: query, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          name: true,
          description: true,
          status: true,
          members: {
            select: { user_id: true },
          },
        },
        take: limit,
      });

      return projects.map((project) => ({
        id: project.id,
        title: project.name,
        category: "proyectos" as const,
        description:
          project.description ||
          `Estado: ${project.status} • ${project.members.length} miembros`,
        url: `/projects/${project.id}`,
      }));
    } catch (error) {
      console.error("[SearchAdapter:projects] Error:", error);
      return [];
    }
  },
};
*/

// ============================================================================
// CHECKLIST: ANTES DE ENTREGAR UN NUEVO ADAPTADOR
// ============================================================================

/**
 * ✅ Validar que:
 * 
 * 1. SEGURIDAD
 *    ☐ Usas userId del contexto (no del cliente)
 *    ☐ Filtras por visibilidad/permisos en la consulta Prisma
 *    ☐ No expones datos sensibles en los resultados
 *    ☐ Validaste la relación usuario-entidad (es participante, es propietario, etc.)
 * 
 * 2. INTERFAZ
 *    ☐ El adaptador implementa completamente SearchAdapter
 *    ☐ Los resultados tienen id, title, category, url
 *    ☐ La categoría es válida (está en SearchCategory)
 *    ☐ El límite de resultados se respeta
 * 
 * 3. MANEJO DE ERRORES
 *    ☐ Hay try-catch en la búsqueda
 *    ☐ Los errores se logean con prefijo del adaptador
 *    ☐ Si hay error, retorna [] (array vacío, no null/undefined)
 * 
 * 4. PERFORMANCE
 *    ☐ La query es eficiente (usa índices)
 *    ☐ No hay queries N+1
 *    ☐ Solo seleccionas los campos necesarios
 *    ☐ Respetas el límite (take: limit)
 * 
 * 5. REGISTRACIÓN
 *    ☐ Importaste el adaptador en search.init.ts
 *    ☐ Llamaste SearchOrchestrator.registerAdapter()
 *    ☐ Agregaste la categoría en lib/search/types.ts
 *    ☐ Agregaste la categoría en types/search.ts (si quieres UI)
 * 
 * 6. TESTING
 *    ☐ Probaste que aparece en el buscador
 *    ☐ Probaste que solo ves resultados a los que tienes acceso
 *    ☐ Probaste que la URL funciona (no retorna 404)
 *    ☐ Probaste que otros usuarios no ven tus resultados privados
 */

// ============================================================================
// TROUBLESHOOTING
// ============================================================================

/**
 * Q: Mi adaptador no aparece en la búsqueda
 * A: 
 *   1. ¿Lo registraste en search.init.ts?
 *   2. ¿initializeSearchAdapters() se llama desde app/actions/search.ts?
 *   3. Revisa console.log() en el servidor para ver errores
 * 
 * Q: Solo aparecen algunos resultados
 * A: 
 *   1. Verifica el filtro de permisos (query WHERE)
 *   2. ¿El usuario realmente tiene acceso a esas entidades?
 *   3. ¿El límite es muy bajo? (por defecto 10 por adaptador)
 * 
 * Q: Aparecen datos que no debería ver
 * A: 
 *   1. ¡RIESGO DE SEGURIDAD!
 *   2. Verifica que usas userId del contexto (no del cliente)
 *   3. Valida la relación usuario-entidad en la query WHERE
 *   4. Prueba con otro usuario para confirmar
 * 
 * Q: La búsqueda es lenta
 * A: 
 *   1. Agrega índices en los campos searchables en BD
 *   2. Reduce el número de campos en SELECT
 *   3. Usa EXPLAIN ANALYZE en PostgreSQL para debuggear
 *   4. Considera usar Full-Text Search (FTS) de PostgreSQL
 */

// ============================================================================
// CONCLUSIÓN
// ============================================================================

/**
 * AGREGAR UN NUEVO MÓDULO ES TAN SIMPLE COMO:
 * 
 * 1. Crear un archivo adapter en lib/search/adapters/
 * 2. Implementar la interfaz SearchAdapter
 * 3. Registrarlo en search.init.ts
 * 4. ¡LISTO!
 * 
 * NO tienes que:
 * - Modificar app/actions/search.ts
 * - Modificar use-global-search.ts
 * - Modificar SearchOrchestrator
 * - Cambiar lógica existente
 * 
 * Esto es escalabilidad verdadera.
 * Este es el patrón correcto.
 */
