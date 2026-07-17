/**
 * Tipos para el buscador global
 */

export type SearchCategory =
  | "usuarios"
  | "articulos"
  | "documentos"
  | "bibliotecas"
  | "carpetas"
  | "equipos"
  | "chats"
  | string;  // Permite extensión futura

export interface SearchResult {
  id: string;
  title: string;
  category: SearchCategory;
  description?: string;
  icon?: string;
  avatar?: string;
  url?: string;
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

export interface RecentSearch {
  id: string;
  query: string;
  timestamp: Date;
}

export interface QuickAccess {
  id: string;
  title: string;
  description: string;
  icon: string;
  url: string;
}
