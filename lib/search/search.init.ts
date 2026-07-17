//lib/search/search.init.ts

/**
 * Inicialización del sistema de búsqueda.
 *
 * Registra todos los Search Providers disponibles para que
 * el SearchOrchestrator pueda ejecutar búsquedas sobre los
 * distintos dominios funcionales de la plataforma.
 */
import { SearchOrchestrator } from "./search.orchestrator";

import { usersSearchProvider } from "./adapters/users.adapter";
import { coursesSearchProvider } from "./adapters/courses.adapter";
import { knowledgeSourcesSearchProvider } from "./adapters/knowledge-sources.adapter";
import { librariesSearchProvider } from "./adapters/knowledge-libraries.adapter";
import { spacesSearchProvider } from "./adapters/knowledge-spaces.adapter";
import { teamsSearchProvider } from "./adapters/knowledge-teams.adapter";

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
  SearchOrchestrator.registerProvider(usersSearchProvider);

  // Learning
  SearchOrchestrator.registerProvider(coursesSearchProvider);

  // Knowledge
  SearchOrchestrator.registerProvider(knowledgeSourcesSearchProvider);
  SearchOrchestrator.registerProvider(librariesSearchProvider);
  SearchOrchestrator.registerProvider(spacesSearchProvider);
  SearchOrchestrator.registerProvider(teamsSearchProvider);
}