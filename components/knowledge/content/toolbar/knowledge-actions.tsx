// components/knowledge/content/toolbar/knowledge-actions.tsx
"use client";

import { FolderPlus } from "lucide-react";

import { KnowledgeUploadMenu } from "./knowledge-upload-menu";
import type { UploadType } from "./types";

type Props = {
  onCreateFolder: () => void;
  onUpload: (type: UploadType) => void;
};

export function KnowledgeActions({
  onCreateFolder,
  onUpload,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <KnowledgeUploadMenu onUpload={onUpload} />

      <button
        type="button"
        onClick={onCreateFolder}
        className="inline-flex h-10 items-center gap-2 rounded-lg bg-surface px-3 text-sm font-medium text-foreground transition hover:bg-surface-hover"
      >
        <FolderPlus
          className="h-4 w-4"
          strokeWidth={2.25}
        />

        Nueva carpeta
      </button>
    </div>
  );
}