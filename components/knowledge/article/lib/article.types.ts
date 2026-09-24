
// components/knowledge/article/lib/article.types.ts

import type {
  Knowledge,
  KnowledgeTeam,
  LibraryPathItem,
  LibraryShare,
} from "@/components/knowledge/detail/knowledge-detail.types";

export type ArticleTab =
  | "general"
  | "details"
  | "documents";

export type Article = Knowledge;

export type ArticleClientProps = {
  knowledge: Article;
  libraryPath: LibraryPathItem[];
  teams: KnowledgeTeam[];
  libraryShares: LibraryShare[];
};