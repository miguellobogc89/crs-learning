// components/knowledge/content/cards/folder/types.ts

import type { DragEventHandler } from "react";

export type KnowledgeLibrary = {
  id: string;
  parent_id: string | null;
  name: string;
  created_at?: Date | string | null;
  updated_at?: Date | string | null;
  article_count?: number;
  folder_count?: number;
  file_count?: number;
};

export type KnowledgeFolderCardProps = {
  folder: KnowledgeLibrary;
  selected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
  draggable?: boolean;
  isDropTarget?: boolean;
  onDragStart?: DragEventHandler<HTMLDivElement>;
  onDragEnd?: DragEventHandler<HTMLDivElement>;
  onDragOver?: DragEventHandler<HTMLDivElement>;
  onDragLeave?: DragEventHandler<HTMLDivElement>;
  onDrop?: DragEventHandler<HTMLDivElement>;
};