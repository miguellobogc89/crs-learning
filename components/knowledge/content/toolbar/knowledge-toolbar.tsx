// components/knowledge/content/toolbar/knowledge-toolbar.tsx

"use client";

import { KnowledgeActions } from "./knowledge-actions";
import { KnowledgeExplorerControls } from "./knowledge-explorer-controls";
import { KnowledgeNavigation } from "./knowledge-navigation";

import type { KnowledgeToolbarProps } from "./types";

export function KnowledgeToolbar({
  explorerState,
  onExplorerStateChange,
  title,
  breadcrumb,
  parentHref,
  onCreateFolder,
  onUpload,
  selectedCount = 0,
  onClearSelection,
  onDeleteSelection,
  onMoveSelection,
  onShareSelection,
}: KnowledgeToolbarProps) {
  return (
    <header className="mb-4">
      <div className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <KnowledgeNavigation
            breadcrumb={breadcrumb}
            title={title}
            parentHref={parentHref}
          />
        </div>

        <div className="flex shrink-0 items-center">
          <KnowledgeActions
            onCreateFolder={onCreateFolder}
            onUpload={onUpload}
          />
        </div>
      </div>

      <KnowledgeExplorerControls
        title={title}
        explorerState={explorerState}
        onExplorerStateChange={onExplorerStateChange}
        selectedCount={selectedCount}
        onMoveSelection={onMoveSelection}
        onShareSelection={onShareSelection}
        onDeleteSelection={onDeleteSelection}
        onClearSelection={onClearSelection}
      />
    </header>
  );
}