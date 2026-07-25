// components/knowledge/content/toolbar/types.ts

import type { ReactNode } from "react";

export type ExplorerSort =
  | "updated_desc"
  | "updated_asc"
  | "name_asc"
  | "name_desc"
  | "status";

export type ExplorerItemType =
  | "all"
  | "folders"
  | "articles";

export type ExplorerStatus =
  | "all"
  | "ready"
  | "processing"
  | "draft"
  | "error";

export type ExplorerState = {
  search: string;
  viewMode: "grid" | "list";
  sort: ExplorerSort;
  itemType: ExplorerItemType;
  status: ExplorerStatus;
};

export type UploadType = "files" | "folder" | "zip";

export type KnowledgeToolbarProps = {
  explorerState: ExplorerState;
  onExplorerStateChange: (state: ExplorerState) => void;
  title: string;
  breadcrumb: ReactNode;
  parentHref: string | null;
  onCreateFolder: () => void;
  onUpload: (type: UploadType) => void;
};

export type KnowledgeNavigationHistory = {
  entries: string[];
  currentIndex: number;
};