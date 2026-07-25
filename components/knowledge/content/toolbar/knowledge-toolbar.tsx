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
    <header className="mb-6 border-b border-border">
      <KnowledgeNavigation
        breadcrumb={breadcrumb}
        parentHref={parentHref}
      />

      <div className="flex flex-col gap-4 pb-6 lg:flex-row lg:items-center lg:justify-between">
        <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>

        <KnowledgeActions
          onCreateFolder={onCreateFolder}
          onUpload={onUpload}
        />
      </div>

<KnowledgeExplorerControls
  title={title}
  explorerState={explorerState}
  onExplorerStateChange={
    onExplorerStateChange
  }
  selectedCount={selectedCount}
  onMoveSelection={onMoveSelection}
  onShareSelection={onShareSelection}
  onDeleteSelection={onDeleteSelection}
  onClearSelection={onClearSelection}
/>
    </header>
  );
}