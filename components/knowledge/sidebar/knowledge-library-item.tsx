// components/knowledge/sidebar/knowledge-library-item.tsx
"use client";

import {
  ChevronRight,
  Folder,
  FolderOpen,
} from "lucide-react";

import { KnowledgeLibraryMenu } from "./knowledge-library-menu";
import type { LibraryItem } from "./types";

type Props = {
  library: LibraryItem;
  level: number;
  openMenuId: string | null;

  inputRef: (element: HTMLInputElement | null) => void;

  onRename: (value: string) => void;
  onSave: () => void;

  onToggleExpanded: () => void;

  onToggleMenu: () => void;
  onCreateChild: () => void;
  onStartRename: () => void;
  onDelete: () => void;
};

export function KnowledgeLibraryItem({
  library,
  level,
  openMenuId,
  inputRef,
  onRename,
  onSave,
  onToggleExpanded,
  onToggleMenu,
  onCreateChild,
  onStartRename,
  onDelete,
}: Props) {
  const hasChildren = Boolean(library.children?.length);

  return (
    <div
      className="group/library relative flex w-full min-w-0 items-center gap-2 rounded-lg py-2 pr-10 text-left text-sm text-panel-foreground/70 transition-colors hover:bg-surface-hover hover:text-foreground"
      style={{
        paddingLeft: `${12 + level * 16}px`,
      }}
      onMouseDown={(event) => {
        if (library.isEditing) {
          event.stopPropagation();
        }
      }}
    >
      <button
        className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground"
        type="button"
        onClick={onToggleExpanded}
      >
        {hasChildren ? (
          <ChevronRight
            className={[
              "h-3.5 w-3.5 transition-transform",
              library.isExpanded ? "rotate-90" : "",
            ].join(" ")}
          />
        ) : (
          <span className="h-3.5 w-3.5" />
        )}
      </button>

      {library.isExpanded ? (
        <FolderOpen className="h-4 w-4 shrink-0" />
      ) : (
        <Folder className="h-4 w-4 shrink-0" />
      )}

      {library.isEditing ? (
        <input
          ref={inputRef}
          className="min-w-0 flex-1 rounded-md border border-cyan-200 bg-background px-2 py-1 text-sm text-foreground outline-none ring-2 ring-cyan-100"
          value={library.name}
          onChange={(event) => onRename(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" ||
              event.key === "Escape"
            ) {
              onSave();
            }
          }}
        />
      ) : (
        <button
          className="min-w-0 flex-1 truncate text-left"
          type="button"
        >
          {library.name}
        </button>
      )}

      {!library.isEditing ? (
        <KnowledgeLibraryMenu
          isOpen={openMenuId === library.id}
          onToggle={onToggleMenu}
          onCreateChild={onCreateChild}
          onRename={onStartRename}
          onDelete={onDelete}
        />
      ) : null}
    </div>
  );
}