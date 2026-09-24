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
      {/* Cabecera: breadcrumb y acciones en la misma fila */}
      <div className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <KnowledgeNavigation
            breadcrumb={breadcrumb}
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

      {/* Controles del explorador, sin título grande encima */}
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