// components/knowledge/detail/knowledge-detail.types.ts
export type ActiveTab =
  | "general"
  | "details"
  | "documents";

export type LibraryPathItem = {
  id: string;
  name: string;
};

export type KnowledgeTeam = {
  id: string;
  name: string;
};

export type LibraryShare = {
  id: string;
  team_id: string;
  access_level: string;
  knowledge_teams: {
    id: string;
    name: string;
    knowledge_team_members: {
      id: string;
    }[];
  };
};

export type KnowledgeFile = {
  id: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  status: string;
  created_at: Date | string;

  users: {
    id: string;
    name: string | null;
    image: string | null;
  } | null;
};

export type SourceContribution = {
  knowledgeFileId: string;
  percentage: number;
};

export type KnowledgeUpdatedByUser = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
};

export type KnowledgeAnalysis = {
  status: string | null;
  model: string | null;
  analysis_json: unknown;
};

export type KnowledgeGraph = {
  applications: unknown;
  products: unknown;
  regulations: unknown;
  dependencies: unknown;
  related_documents: unknown;
};

export type Knowledge = {
  id: string;
  title: string;
  description: string | null;
  visibility: string;
  knowledge_type: string;
  status: string;
  content: string;
  updated_at: Date | string;
  library_id: string | null;

  users_knowledge_sources_updated_by_user_idTousers:
    | KnowledgeUpdatedByUser
    | null;

  knowledge_files: KnowledgeFile[];
  knowledge_analysis: KnowledgeAnalysis | null;
  knowledge_graph: KnowledgeGraph | null;
};

export type KnowledgeDetailClientProps = {
  knowledge: Knowledge;
  libraryPath: LibraryPathItem[];
  teams: KnowledgeTeam[];
  libraryShares: LibraryShare[];
};