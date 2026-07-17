/**
 * Inicialización del sistema de búsqueda modular
 * Registra todos los adaptadores disponibles
 * 
 * Este archivo se importa desde el server action para garantizar
 * que todos los adaptadores estén registrados antes de usar el orquestador
 */

import { SearchOrchestrator } from "./search.orchestrator";
import { usersSearchAdapter } from "./adapters/users.adapter";
import { coursesSearchAdapter } from "./adapters/courses.adapter";
import { knowledgeSourcesSearchAdapter } from "./adapters/knowledge-sources.adapter";
import { librariesSearchAdapter } from "./adapters/knowledge-libraries.adapter";
import { spacesSearchAdapter } from "./adapters/knowledge-spaces.adapter";
import { teamsSearchAdapter } from "./adapters/knowledge-teams.adapter";

/**
 * Registra todos los adaptadores de búsqueda disponibles
 * 
 * Para agregar un nuevo módulo de búsqueda:
 * 1. Crear un nuevo archivo en lib/search/adapters/{module}.adapter.ts
 * 2. Exportar un objeto que implemente SearchAdapter
 * 3. Importarlo aquí
 * 4. Llamar SearchOrchestrator.registerAdapter(newAdapter)
 * 
 * Ejemplo:
 * ```
 * import { chatsSearchAdapter } from "./adapters/chats.adapter";
 * SearchOrchestrator.registerAdapter(chatsSearchAdapter);
 * ```
 */
export function initializeSearchAdapters(): void {
  // Módulo: Users
  SearchOrchestrator.registerAdapter(usersSearchAdapter);

  // Módulo: Courses
  SearchOrchestrator.registerAdapter(coursesSearchAdapter);

  // Módulo: Knowledge > Sources (Documentos)
  SearchOrchestrator.registerAdapter(knowledgeSourcesSearchAdapter);

  // Módulo: Knowledge > Libraries
  SearchOrchestrator.registerAdapter(librariesSearchAdapter);

  // Módulo: Knowledge > Spaces
  SearchOrchestrator.registerAdapter(spacesSearchAdapter);

  // Módulo: Knowledge > Teams
  SearchOrchestrator.registerAdapter(teamsSearchAdapter);

  // Próximos módulos a agregar:
  // - Chats (cuando esté implementado)
  // - Announcements (cuando esté implementado)
  // - Proyectos (si se agrega)
  // - etc.
}
