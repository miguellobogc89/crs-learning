// lib/search/types.ts
/**
 * Tipos compartidos para el sistema modular de búsqueda.
 *
 * La arquitectura se organiza alrededor de dominios funcionales
 * de la plataforma, no alrededor de tablas o modelos de Prisma.
 */

export type SearchCategory =
  | "usuarios"
  | "articulos"
  | "documentos"
  | "bibliotecas"
  | "carpetas"
  | "equipos"
  | "cursos"
  | "chats"
  | "automatizaciones";

export interface SearchResult {
  id: string;
  title: string;
  category: SearchCategory;
  description?: string;
  avatar?: string;
  icon?: string;
  url?: string;
  metadata?: Record<string, unknown>;
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

/**
 * Contexto seguro construido en el servidor.
 *
 * userId nunca debe recibirse desde el cliente.
 * En el futuro se podrán incorporar aquí companyId,
 * equipos, roles, permisos y locale.
 */
export interface SearchContext {
  query: string;
  userId: string;
  limit?: number;
}

/**
 * Contrato común de los proveedores de búsqueda.
 *
 * Cada dominio funcional implementa este contrato y se encarga
 * internamente de consultar las tablas o servicios que necesite.
 */
export interface SearchProvider {
  /**
   * Identificador único del proveedor.
   *
   * Ejemplos:
   * - users
   * - knowledge
   * - learning
   * - teams
   * - chats
   */
  readonly id: string;

  /**
   * Categoría de resultados proporcionada.
   */
  readonly category: SearchCategory;

  /**
   * Etiqueta legible utilizada en la interfaz.
   */
  readonly label: string;

  /**
   * Ejecuta la búsqueda dentro del dominio respetando
   * el contexto y los permisos del usuario.
   */
  search(context: SearchContext): Promise<SearchResult[]>;
}

/**
 * Registro central de proveedores disponibles.
 */
export interface SearchProviderRegistry {
  register(provider: SearchProvider): void;
  getProvider(id: string): SearchProvider | undefined;
  getAllProviders(): SearchProvider[];
}