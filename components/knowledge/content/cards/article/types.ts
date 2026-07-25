// components/knowledge/content/cards/article/types.ts

export type KnowledgeSource = {
  id: string;
  title: string;
  description?: string | null;
  content?: string | null;
  summary?: string | null;
  language?: string | null;
  domain?: string | null;
  level?: string | null;
  tags?: unknown;
  status?: string | null;
  visibility?: string | null;
  updated_at?: Date | string | null;
  knowledge_type?: string | null;
  confidence?: number | null;
};

export type KnowledgeCardProps = {
  knowledge: KnowledgeSource;

  selected?: boolean;
  onSelectedChange?: (
    selected: boolean,
  ) => void;

  onShare?: (
    knowledge: KnowledgeSource,
  ) => void;
};