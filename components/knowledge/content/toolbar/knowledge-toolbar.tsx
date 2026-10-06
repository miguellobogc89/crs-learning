// components/knowledge/content/toolbar/knowledge-toolbar.tsx

"use client";

import { KnowledgeExplorerControls } from "./knowledge-explorer-controls";

import type { KnowledgeToolbarProps } from "./types";

export function KnowledgeToolbar({
  explorerState,
  onExplorerStateChange,
  title,
  selectedCount = 0,
  onClearSelection,
  onDeleteSelection,
  onMoveSelection,
  onShareSelection,
}: KnowledgeToolbarProps) {
  return (
    <div className="knowledge-toolbar-container">
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
    </div>
  );
}