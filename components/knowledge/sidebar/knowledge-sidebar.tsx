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

  function renderLibrary(library: LibraryItem, level = 0) {
  const hasChildren = Boolean(library.children?.length);

return (
  <div key={library.id}>
    <div
      className="group/library relative flex w-full min-w-0 items-center gap-2 rounded-lg py-2 pr-10 text-left text-sm text-panel-foreground/70 transition-colors hover:bg-surface-hover hover:text-foreground"
      style={{ paddingLeft: `${12 + level * 16}px` }}
      onMouseDown={(event) => {
        if (library.isEditing) {
          event.stopPropagation();
        }
      }}
    >
        <button
          className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground"
          type="button"
          onClick={() => handleToggleExpanded(library.id)}
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
  ref={(element) => {
    inputRefs.current[library.id] = element;
  }}
  className="min-w-0 flex-1 rounded-md border border-cyan-200 bg-background px-2 py-1 text-sm text-foreground outline-none ring-2 ring-cyan-100"
  value={library.name}
  onChange={(event) =>
    handleRenameLibrary(library.id, event.target.value)
  }
  onBlur={(event) => {
  event.currentTarget.blur();
  handleSaveLibrary(library.id);
}}
  onKeyDown={(event) => {
    if (event.key === "Enter" || event.key === "Escape") {
      handleSaveLibrary(library.id);
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
          <button
  className="absolute right-2 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition hover:bg-background hover:text-foreground group-hover/library:opacity-100"
  type="button"
  onMouseDown={(event) => event.preventDefault()}
  onClick={() =>
    setOpenMenuId((currentId) =>
      currentId === library.id ? null : library.id,
    )
  }
  aria-label="Opciones de biblioteca"
>
  <MoreHorizontal className="h-4 w-4" />
</button>
        ) : null}

        {openMenuId === library.id ? (
          <div className="absolute right-2 top-9 z-20 w-40 rounded-lg border border-border bg-background p-1 shadow-sm">

            <button
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-foreground hover:bg-surface"
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => handleCreateChildLibrary(library.id)}
            >
              <Plus className="h-3.5 w-3.5" />
              Añadir carpeta
            </button>

            <button
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-foreground hover:bg-surface"
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => handleStartRename(library.id)}
            >
              <Pencil className="h-3.5 w-3.5" />
              Renombrar
            </button>

            <button
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-red-600 hover:bg-red-50"
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => handleDeleteLibrary(library.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Eliminar
            </button>
          </div>
        ) : null}
      </div>

      {hasChildren && library.isExpanded ? (
        <div className="mt-1 space-y-1">
          {library.children!.map((child) => renderLibrary(child, level + 1))}
        </div>
      ) : null}
    </div>
  );
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
            {filteredLibraries.map((library) => renderLibrary(library))}

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