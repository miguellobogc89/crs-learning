// components/knowledge/sidebar/knowledge-library-item.tsx
"use client";

import type { DragEvent } from "react";
import {
  ChevronRight,
  Folder,
  FolderOpen,
  Share2,
} from "lucide-react";

import { KnowledgeLibraryMenu } from "./knowledge-library-menu";
import type { LibraryItem } from "./types";

type Props = {
  library: LibraryItem;
  level: number;
  openMenuId: string | null;
  selectedLibraryId: string | null;
  readonly?: boolean;
  isDragging?: boolean;
  isDropTarget?: boolean;

  inputRef: (element: HTMLInputElement | null) => void;

  onRename: (value: string) => void;
  onSave: () => void;
  onToggleExpanded: () => void;
  onToggleMenu: () => void;
  onCreateChild: () => void;
  onStartRename: () => void;
  onDelete: () => void;
  onSelect: () => void;
  onDragStart?: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
  onDragOver?: (event: DragEvent<HTMLDivElement>) => void;
  onDrop?: (event: DragEvent<HTMLDivElement>) => void;
};

export function KnowledgeLibraryItem({
  library,
  level,
  openMenuId,
  selectedLibraryId,
  readonly = false,
  isDragging = false,
  isDropTarget = false,
  inputRef,
  onRename,
  onSave,
  onToggleExpanded,
  onToggleMenu,
  onCreateChild,
  onStartRename,
  onDelete,
  onSelect,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: Props) {
  const hasChildren = Boolean(library.children?.length);
  const isSelected = selectedLibraryId === library.id;
  const isShared = Boolean(
    library.is_shared || library.is_team_shared,
  );

  function handleSelect() {
    onSelect();

    if (hasChildren) {
      onToggleExpanded();
    }
  }

  return (
    <div
      draggable={!readonly && !library.isEditing}
      className={[
        "group/library relative flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg py-2 text-left text-sm transition-colors",
        readonly ? "pr-3" : "pr-10",
        isSelected
          ? "bg-surface text-foreground"
          : "text-panel-foreground/70 hover:bg-surface-hover hover:text-foreground",
        isDragging ? "opacity-40" : "",
        isDropTarget
          ? "bg-sky-50 text-foreground ring-1 ring-inset ring-sky-300"
          : "",
      ].join(" ")}
      style={{
        paddingLeft: `${12 + level * 16}px`,
      }}
      onMouseDown={(event) => {
        if (library.isEditing) {
          event.stopPropagation();
        }
      }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <button
        className="flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center text-muted-foreground"
        type="button"
        onClick={(event) => {
          event.stopPropagation();

          if (hasChildren) {
            onToggleExpanded();
          }
        }}
        aria-label={
          library.isExpanded ? "Contraer carpeta" : "Expandir carpeta"
        }
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

      {isSelected || library.isExpanded ? (
        <FolderOpen className="h-4 w-4 shrink-0 text-sky-400" />
      ) : (
        <Folder className="h-4 w-4 shrink-0 text-sky-400" />
      )}

      {library.isEditing && !readonly ? (
        <input
          ref={inputRef}
          className="min-w-0 flex-1 rounded-md border border-cyan-200 bg-background px-2 py-1 text-sm text-foreground outline-none ring-2 ring-cyan-100"
          value={library.name}
          onChange={(event) => onRename(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === "Escape") {
              onSave();
            }
          }}
        />
      ) : (
        <button
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
          type="button"
          onClick={handleSelect}
        >
          <span className="truncate">{library.name}</span>

          {isShared ? (
            <Share2
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
              aria-label="Carpeta compartida"
            />
          ) : null}
        </button>
      )}

      {!library.isEditing && !readonly ? (
        <KnowledgeLibraryMenu
          libraryId={library.id}
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