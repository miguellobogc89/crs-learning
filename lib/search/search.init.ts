// lib/search/search.init.ts
/**
 * Inicialización del sistema de búsqueda.
 *
 * Registra todos los Search Providers disponibles para que
 * el SearchOrchestrator pueda ejecutar búsquedas sobre los
 * distintos dominios funcionales de la plataforma.
 */

import { SearchOrchestrator } from "./search.orchestrator";

import { usersSearchAdapter } from "./adapters/users.adapter";
import { coursesSearchAdapter } from "./adapters/courses.adapter";
import { knowledgeSourcesSearchAdapter } from "./adapters/knowledge-sources.adapter";
import { librariesSearchAdapter } from "./adapters/knowledge-libraries.adapter";
import { spacesSearchAdapter } from "./adapters/knowledge-spaces.adapter";
import { teamsSearchAdapter } from "./adapters/knowledge-teams.adapter";

/**
 * Registra todos los dominios de búsqueda disponibles.
 *
 * Para añadir un nuevo dominio:
 *
 * 1. Crear un Search Provider.
 * 2. Importarlo aquí.
 * 3. Registrarlo mediante SearchOrchestrator.registerProvider().
 */
export function initializeSearchProviders(): void {
  // Usuarios
  SearchOrchestrator.registerProvider(usersSearchAdapter);

  // Formación
  SearchOrchestrator.registerProvider(coursesSearchAdapter);

  // Knowledge
  SearchOrchestrator.registerProvider(knowledgeSourcesSearchAdapter);
  SearchOrchestrator.registerProvider(librariesSearchAdapter);
  SearchOrchestrator.registerProvider(spacesSearchAdapter);
  SearchOrchestrator.registerProvider(teamsSearchAdapter);

  // Futuros dominios:
  //
  // SearchOrchestrator.registerProvider(chatSearchProvider);
  // SearchOrchestrator.registerProvider(automationSearchProvider);
  // SearchOrchestrator.registerProvider(notificationsSearchProvider);
}