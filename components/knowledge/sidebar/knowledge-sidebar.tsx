// components/knowledge/knowledge-sidebar.tsx
"use client";

import { useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { KnowledgeViewItem } from "./knowledge-view-item";
import { SearchInput } from "@/components/ui/search-input";
import {
  createKnowledgeLibrary,
  renameKnowledgeLibrary,
  deleteKnowledgeLibrary,
} from "@/lib/actions/knowledge-library.actions";
import type { LibraryItem, SidebarItem } from "./types";
import { KnowledgeLibraryTree } from "./knowledge-library-tree";
import {
  buildLibraryTree,
  renameLibrary,
  startRename,
  deleteLibrary,
  toggleLibrary,
  saveLibraries,
  findLibraryById,
} from "./tree-utils";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Props = {
  sidebarItems: SidebarItem[];
  knowledgeLibraries: any[];
  defaultLibraryId: string | null;
};


export function KnowledgeSidebar({
  sidebarItems,
  knowledgeLibraries,
  defaultLibraryId,
}: Props) {
  const [search, setSearch] = useState("");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [libraries, setLibraries] = useState<LibraryItem[]>(
  () => buildLibraryTree(knowledgeLibraries),
);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const selectedLibraryId = searchParams.get("library");

  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const filteredLibraries = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    if (!normalizedSearch) {
      return libraries;
    }

    return libraries.filter((library) =>
      library.name.toLowerCase().includes(normalizedSearch),
    );
  }, [libraries, search]);

async function handleCreateLibrary() {
  const library = await createKnowledgeLibrary(null);

  setLibraries((currentLibraries) => [
    {
      id: library.id,
      name: library.name,
      isEditing: true,
      isExpanded: true,
      children: [],
    },
    ...currentLibraries,
  ]);

  window.setTimeout(() => {
    inputRefs.current[library.id]?.focus();
    inputRefs.current[library.id]?.select();
  }, 0);
}


function handleRenameLibrary(id: string, name: string) {
  setLibraries((current) => renameLibrary(current, id, name));
}

function handleSelectLibrary(id: string) {
  const params = new URLSearchParams(searchParams.toString());

  if (selectedLibraryId === id) {
    params.delete("library");
  } else {
    params.set("library", id);
  }

  const query = params.toString();

  router.replace(query ? `${pathname}?${query}` : pathname);
}

function handleStartRename(id: string) {
  setOpenMenuId(null);

  setLibraries((current) => startRename(current, id));

  window.setTimeout(() => {
    inputRefs.current[id]?.focus();
    inputRefs.current[id]?.select();
  }, 0);
}

async function handleDeleteLibrary(id: string) {
  setOpenMenuId(null);

  await deleteKnowledgeLibrary(id);

  setLibraries((current) => deleteLibrary(current, id));
}

function handleToggleExpanded(id: string) {
  setLibraries((current) => toggleLibrary(current, id));
}

function saveEditingLibraries() {
  setLibraries((current) => saveLibraries(current));
}

async function handleSaveLibrary(id: string) {
  const library = findLibraryById(libraries, id);

  if (library) {
    await renameKnowledgeLibrary(id, library.name.trim());
  }

  setLibraries((current) => saveLibraries(current));
}



async function handleCreateChildLibrary(parentId: string) {
  const library = await createKnowledgeLibrary(parentId);

  function addChild(items: LibraryItem[]): LibraryItem[] {
    return items.map((item) => {
      if (item.id === parentId) {
        return {
          ...item,
          isExpanded: true,
          children: [
            {
              id: library.id,
              name: library.name,
              isEditing: true,
              isExpanded: true,
              children: [],
            },
            ...(item.children ?? []),
          ],
        };
      }

      if (item.children?.length) {
        return {
          ...item,
          children: addChild(item.children),
        };
      }

      return item;
    });
  }

  setOpenMenuId(null);
  setLibraries((currentLibraries) => addChild(currentLibraries));

  window.setTimeout(() => {
    inputRefs.current[library.id]?.focus();
    inputRefs.current[library.id]?.select();
  }, 0);
}



  return (
    <aside
  className="min-h-0 border-r border-border bg-panel"
  onMouseDown={(event) => {
    const target = event.target as HTMLElement;

    if (target.closest("input")) {
      return;
    }

    saveEditingLibraries();
  }}
>
      <div className="border-b border-border p-4">
        <SearchInput
          placeholder="Buscar biblioteca..."
          value={search}
          onChange={setSearch}
        />
      </div>

      <div className="space-y-6 p-4">
        <div>
          <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Vistas
          </p>

          <div className="space-y-1">
{sidebarItems.map((item) => (
  <KnowledgeViewItem
    key={item.label}
    item={item}
    onSelect={() => {
      const params = new URLSearchParams(searchParams.toString());
      const label = item.label.toLowerCase();

      params.delete("library");

      if (label.includes("públic") || label.includes("public")) {
        params.set("view", "public");
      } else if (label.includes("privad") || label.includes("private")) {
        params.set("view", "private");
      } else {
        params.delete("view");
      }

      const query = params.toString();

      router.push(query ? `${pathname}?${query}` : pathname);
    }}
  />
))}
          </div>
        </div>

        <div>
          <div className="group mb-2 flex items-center justify-between px-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Bibliotecas
            </p>

            <button
              className="flex h-6 w-6 items-center justify-center rounded-md border border-border bg-background text-muted-foreground opacity-0 transition hover:bg-surface hover:text-foreground group-hover:opacity-100"
              type="button"
              onClick={handleCreateLibrary}
              aria-label="Crear biblioteca"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="space-y-1">
            <KnowledgeLibraryTree
              libraries={filteredLibraries}
              openMenuId={openMenuId}
              inputRefs={inputRefs}
              onRename={handleRenameLibrary}
              onSave={handleSaveLibrary}
              onToggleExpanded={handleToggleExpanded}
              onToggleMenu={(id) =>
                setOpenMenuId((current) =>
                  current === id ? null : id,
                )
              }
              onCreateChild={handleCreateChildLibrary}
              onStartRename={handleStartRename}
              onDelete={handleDeleteLibrary}
              selectedLibraryId={selectedLibraryId}
              onSelect={handleSelectLibrary}
            />

            {filteredLibraries.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                No hay bibliotecas que coincidan.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </aside>
  );
}