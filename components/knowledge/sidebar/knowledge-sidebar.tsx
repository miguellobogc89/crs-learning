// components/knowledge/knowledge-sidebar.tsx
"use client";

import { useMemo, useRef, useState } from "react";
import {
  BookOpen,
  FileText,
  Folder,
  FolderOpen,
  ChevronRight,
  Globe2,
  MoreHorizontal,
  Plus,
  ShieldCheck,
  Trash2,
  Pencil,
} from "lucide-react";

import { SearchInput } from "@/components/ui/search-input";
import { createKnowledgeLibrary } from "@/lib/actions/knowledge-library.actions";
import type { LibraryItem, SidebarItem } from "./types";
import { KnowledgeLibraryTree } from "./knowledge-library-tree";

type Props = {
  sidebarItems: SidebarItem[];
  knowledgeLibraries: any[];
};


const sidebarIcons = {
  book: BookOpen,
  file: FileText,
  shield: ShieldCheck,
  globe: Globe2,
};

function buildLibraryTree(libraries: any[]): LibraryItem[] {
  const map = new Map<string, LibraryItem>();

  libraries.forEach((library) => {
    map.set(library.id, {
      id: library.id,
      name: library.name,
      isExpanded: true,
      children: [],
    });
  });

  const roots: LibraryItem[] = [];

  libraries.forEach((library) => {
    const node = map.get(library.id)!;

    if (library.parent_id) {
      const parent = map.get(library.parent_id);

      if (parent) {
        parent.children!.push(node);
        return;
      }
    }

    roots.push(node);
  });

  return roots;
}

export function KnowledgeSidebar({
  sidebarItems,
  knowledgeLibraries,
}: Props) {
  const [search, setSearch] = useState("");
  const [libraries, setLibraries] = useState<LibraryItem[]>(
  () => buildLibraryTree(knowledgeLibraries),
);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

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
  function rename(items: LibraryItem[]): LibraryItem[] {
    return items.map((library) => {
      if (library.id === id) {
        return {
          ...library,
          name,
        };
      }

      if (library.children?.length) {
        return {
          ...library,
          children: rename(library.children),
        };
      }

      return library;
    });
  }

  setLibraries((currentLibraries) => rename(currentLibraries));
}
function saveEditingLibraries() {
  function save(items: LibraryItem[]): LibraryItem[] {
    return items.map((library) => {
      const cleanName = library.name.trim();

      return {
        ...library,
        name: cleanName || "Nueva biblioteca",
        isEditing: false,
        children: library.children?.length ? save(library.children) : library.children,
      };
    });
  }

  setLibraries((currentLibraries) => save(currentLibraries));
}

function handleStartRename(id: string) {
  function startRename(items: LibraryItem[]): LibraryItem[] {
    return items.map((library) => {
      if (library.id === id) {
        return {
          ...library,
          isEditing: true,
        };
      }

      if (library.children?.length) {
        return {
          ...library,
          children: startRename(library.children),
        };
      }

      return library;
    });
  }

  setOpenMenuId(null);
  setLibraries((currentLibraries) => startRename(currentLibraries));

  window.setTimeout(() => {
    inputRefs.current[id]?.focus();
    inputRefs.current[id]?.select();
  }, 0);
}

function handleSaveLibrary(id: string) {
  function save(items: LibraryItem[]): LibraryItem[] {
    return items.map((library) => {
      if (library.id === id) {
        const cleanName = library.name.trim();

        return {
          ...library,
          name: cleanName || "Nueva biblioteca",
          isEditing: false,
        };
      }

      if (library.children?.length) {
        return {
          ...library,
          children: save(library.children),
        };
      }

      return library;
    });
  }

  setLibraries((currentLibraries) => save(currentLibraries));
} 

function handleDeleteLibrary(id: string) {
  function remove(items: LibraryItem[]): LibraryItem[] {
    return items
      .filter((library) => library.id !== id)
      .map((library) => {
        if (library.children?.length) {
          return {
            ...library,
            children: remove(library.children),
          };
        }

        return library;
      });
  }

  setOpenMenuId(null);
  setLibraries((currentLibraries) => remove(currentLibraries));
}

  function handleToggleExpanded(id: string) {
    function toggle(items: LibraryItem[]): LibraryItem[] {
      return items.map((library) => {
        if (library.id === id) {
          return {
            ...library,
            isExpanded: !library.isExpanded,
          };
        }

        if (library.children?.length) {
          return {
            ...library,
            children: toggle(library.children),
          };
        }

        return library;
      });
    }

    setLibraries((currentLibraries) => toggle(currentLibraries));
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
            {sidebarItems.map((item) => {
              const Icon = sidebarIcons[item.icon];

              return (
                <button
                  key={item.label}
                  className={[
                    "flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors",
                    item.active
                      ? "bg-surface text-foreground"
                      : "text-panel-foreground/70 hover:bg-surface-hover hover:text-foreground",
                  ].join(" ")}
                  type="button"
                >
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </span>

                  <span className="text-xs text-muted-foreground">
                    {item.count}
                  </span>
                </button>
              );
            })}
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