// components/knowledge/sidebar/knowledge-library-tree.tsx
"use client";

import type { LibraryItem } from "./types";
import { KnowledgeLibraryItem } from "./knowledge-library-item";

type Props = {
  libraries: LibraryItem[];
  level?: number;
  openMenuId: string | null;
  selectedLibraryId: string | null;

  inputRefs: React.MutableRefObject<Record<string, HTMLInputElement | null>>;

  onRename: (id: string, value: string) => void;
  onSave: (id: string) => void;
  onToggleExpanded: (id: string) => void;
  onToggleMenu: (id: string) => void;
  onCreateChild: (id: string) => void;
  onStartRename: (id: string) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string) => void;
};

export function KnowledgeLibraryTree({
  libraries,
  level = 0,
  openMenuId,
  selectedLibraryId,
  inputRefs,
  onRename,
  onSave,
  onToggleExpanded,
  onToggleMenu,
  onCreateChild,
  onStartRename,
  onDelete,
  onSelect,
}: Props) {
  return (
    <>
      {libraries.map((library) => (
        <div key={library.id}>
          <KnowledgeLibraryItem
            library={library}
            level={level}
            openMenuId={openMenuId}
            selectedLibraryId={selectedLibraryId}
            inputRef={(element) => {
              inputRefs.current[library.id] = element;
            }}
            onRename={(value) => onRename(library.id, value)}
            onSave={() => onSave(library.id)}
            onToggleExpanded={() => onToggleExpanded(library.id)}
            onToggleMenu={() => onToggleMenu(library.id)}
            onCreateChild={() => onCreateChild(library.id)}
            onStartRename={() => onStartRename(library.id)}
            onDelete={() => onDelete(library.id)}
            onSelect={() => onSelect(library.id)}
          />

          {library.isExpanded && library.children?.length ? (
            <div className="mt-1 space-y-1">
              <KnowledgeLibraryTree
                libraries={library.children}
                level={level + 1}
                openMenuId={openMenuId}
                selectedLibraryId={selectedLibraryId}
                inputRefs={inputRefs}
                onRename={onRename}
                onSave={onSave}
                onToggleExpanded={onToggleExpanded}
                onToggleMenu={onToggleMenu}
                onCreateChild={onCreateChild}
                onStartRename={onStartRename}
                onDelete={onDelete}
                onSelect={onSelect}
              />
            </div>
          ) : null}
        </div>
      ))}
    </>
  );
}