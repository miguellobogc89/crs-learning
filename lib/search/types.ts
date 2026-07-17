/**
 * Tipos compartidos para el sistema de búsqueda modular
 * Define la interfaz que todos los adaptadores de búsqueda deben cumplir
 */

export type SearchCategory =
  | "usuarios"
  | "articulos"
  | "documentos"
  | "bibliotecas"
  | "carpetas"
  | "equipos"
  | "chats"
  | "cualquier-otro-modulo";

export interface SearchResult {
  id: string;
  title: string;
  category: SearchCategory;
  description?: string;
  avatar?: string;
  icon?: string;
  url?: string;
  metadata?: Record<string, any>;
}

export interface SearchGroup {
  category: SearchCategory;
  label: string;
  results: SearchResult[];
}

export interface SearchResponse {
  groups: SearchGroup[];
  total: number;
  query: string;
  executionTime: number;
}

export interface SearchContext {
  query: string;
  userId: string;
  limit?: number;
}

/**
 * Interfaz que todos los adaptadores de búsqueda deben implementar
 * Permite agregar nuevos módulos sin modificar la lógica central
 */
export interface SearchAdapter {
  /**
   * ID único del adaptador (ej: "users", "courses", "knowledge")
   */
  readonly id: string;

  /**
   * Categoría que maneja este adaptador
   */
  readonly category: SearchCategory;

  /**
   * Etiqueta legible para mostrar en la UI
   */
  readonly label: string;

  /**
   * Realiza la búsqueda en este módulo respetando permisos del usuario
   * @param context Contexto de búsqueda (query, userId, limit)
   * @returns Resultados accesibles para el usuario
   */
  search(context: SearchContext): Promise<SearchResult[]>;
}

export interface SearchAdapterRegistry {
  register(adapter: SearchAdapter): void;
  getAdapter(id: string): SearchAdapter | undefined;
  getAllAdapters(): SearchAdapter[];
}
