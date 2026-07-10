// components/knowledge/sidebar/knowledge-sidebar.tsx
"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import {
  ChevronDown,
  ChevronRight,
  CornerDownLeft,
  Plus,
  UsersRound,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { SearchInput } from "@/components/ui/search-input";
import {
  createKnowledgeLibrary,
  deleteKnowledgeLibrary,
  moveKnowledgeLibrary,
  renameKnowledgeLibrary,
} from "@/lib/actions/knowledge-library.actions";

import { KnowledgeLibraryTree } from "./knowledge-library-tree";
import { KnowledgeViewItem } from "./knowledge-view-item";
import type { LibraryItem, SidebarItem } from "./types";
import {
  buildLibraryTree,
  deleteLibrary,
  findLibraryById,
  libraryContainsId,
  moveLibraryNode,
  renameLibrary,
  saveLibraries,
  startRename,
  toggleLibrary,
} from "./tree-utils";

type KnowledgeLibrary = {
  id: string;
  name: string;
  parent_id: string | null;
  owner_user_id?: string;
  is_shared?: boolean;
  knowledge_library_team_permissions?: {
    team_id: string;
    knowledge_teams: {
      id: string;
      name: string;
    };
  }[];
};

type KnowledgeTeam = {
  id: string;
  name: string;
};

type TeamGroup = {
  id: string;
  name: string;
  libraries: KnowledgeLibrary[];
};

type Props = {
  sidebarItems: SidebarItem[];
  knowledgeLibraries: KnowledgeLibrary[];
  knowledgeTeams: KnowledgeTeam[];
  defaultLibraryId: string | null;
};

function applyExpandedState(
  items: LibraryItem[],
  expandedIds: Set<string>,
): LibraryItem[] {
  return items.map((item) => ({
    ...item,
    isExpanded: expandedIds.has(item.id),
    children: item.children?.length
      ? applyExpandedState(item.children, expandedIds)
      : item.children,
  }));
}

function filterLibraryTree(
  libraries: LibraryItem[],
  search: string,
): LibraryItem[] {
  const normalizedSearch = search.trim().toLowerCase();

  if (!normalizedSearch) {
    return libraries;
  }

  const result: LibraryItem[] = [];

  for (const library of libraries) {
    const filteredChildren = library.children?.length
      ? filterLibraryTree(library.children, search)
      : [];

    const matches = library.name.toLowerCase().includes(normalizedSearch);

    if (matches || filteredChildren.length > 0) {
      result.push({
        ...library,
        isExpanded: filteredChildren.length > 0 || library.isExpanded,
        children: filteredChildren,
      });
    }
  }

  return result;
}

export function KnowledgeSidebar({
  sidebarItems,
  knowledgeLibraries,
  knowledgeTeams,
  defaultLibraryId,
}: Props) {
  const [search, setSearch] = useState("");
  const [isMyLibraryOpen, setIsMyLibraryOpen] = useState(true);
  const [isSharedOpen, setIsSharedOpen] = useState(true);
  const [isTeamsOpen, setIsTeamsOpen] = useState(true);

  const [openTeamIds, setOpenTeamIds] = useState<Record<string, boolean>>({});
  const [readonlyExpandedIds, setReadonlyExpandedIds] = useState<Set<string>>(
    () => new Set(),
  );

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [draggedLibraryId, setDraggedLibraryId] = useState<string | null>(null);
  const [dropTargetLibraryId, setDropTargetLibraryId] = useState<string | null>(
    null,
  );
  const [isRootDropTarget, setIsRootDropTarget] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();

  const selectedView = searchParams.get("view") ?? "all";
  const selectedLibraryId = searchParams.get("library");

  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const ownedKnowledgeLibraries = useMemo(() => {
    return knowledgeLibraries.filter((library) => !library.is_shared);
  }, [knowledgeLibraries]);

  const sharedKnowledgeLibraries = useMemo(() => {
    return knowledgeLibraries.filter((library) => library.is_shared);
  }, [knowledgeLibraries]);

  const initialLibraries = useMemo(() => {
    const tree = buildLibraryTree(ownedKnowledgeLibraries);
    const root = tree.find((library) => library.id === defaultLibraryId);

    if (!root) {
      return tree;
    }

    return root.children ?? [];
  }, [ownedKnowledgeLibraries, defaultLibraryId]);

  const [libraries, setLibraries] = useState<LibraryItem[]>(initialLibraries);

useEffect(() => {
  setLibraries((currentLibraries) => {
    const expandedIds = new Set<string>();

    function collectExpanded(items: LibraryItem[]) {
      for (const item of items) {
        if (item.isExpanded) {
          expandedIds.add(item.id);
        }

        if (item.children?.length) {
          collectExpanded(item.children);
        }
      }
    }

    collectExpanded(currentLibraries);

    return applyExpandedState(initialLibraries, expandedIds);
  });
}, [initialLibraries]);

  useEffect(() => {
    function handleOutsideMouseDown(event: MouseEvent) {
      const target = event.target as HTMLElement;

      if (target.closest("[data-knowledge-library-menu]")) {
        return;
      }

      setOpenMenuId(null);
    }

    document.addEventListener("mousedown", handleOutsideMouseDown);

    return () => {
      document.removeEventListener("mousedown", handleOutsideMouseDown);
    };
  }, []);

  const teamGroups = useMemo<TeamGroup[]>(() => {
    return knowledgeTeams.map((team) => {
      const librariesForTeam = knowledgeLibraries.filter((library) =>
        library.knowledge_library_team_permissions?.some(
          (permission) => permission.team_id === team.id,
        ),
      );

      return {
        id: team.id,
        name: team.name,
        libraries: librariesForTeam,
      };
    });
  }, [knowledgeTeams, knowledgeLibraries]);

  const filteredLibraries = useMemo(() => {
    return filterLibraryTree(libraries, search);
  }, [libraries, search]);

  const filteredSharedLibraries = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    if (!normalizedSearch) {
      return sharedKnowledgeLibraries;
    }

    return sharedKnowledgeLibraries.filter((library) =>
      library.name.toLowerCase().includes(normalizedSearch),
    );
  }, [sharedKnowledgeLibraries, search]);

  function buildReadonlyLibraryTree(items: KnowledgeLibrary[]) {
    const tree = buildLibraryTree(items);

    return applyExpandedState(tree, readonlyExpandedIds);
  }

  function toggleReadonlyLibrary(id: string) {
    setReadonlyExpandedIds((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }

  function clearDragState() {
    setDraggedLibraryId(null);
    setDropTargetLibraryId(null);
    setIsRootDropTarget(false);
  }

  function handleDragStart(
    libraryId: string,
    event: DragEvent<HTMLDivElement>,
  ) {
    setDraggedLibraryId(libraryId);
    setDropTargetLibraryId(null);
    setIsRootDropTarget(false);

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", libraryId);
  }

  function handleDragOverLibrary(
    targetLibraryId: string,
    event: DragEvent<HTMLDivElement>,
  ) {
    if (!draggedLibraryId) {
      return;
    }

    if (draggedLibraryId === targetLibraryId) {
      return;
    }

    const draggedLibrary = findLibraryById(libraries, draggedLibraryId);

    if (!draggedLibrary) {
      return;
    }

    if (libraryContainsId(draggedLibrary, targetLibraryId)) {
      setDropTargetLibraryId(null);
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    event.dataTransfer.dropEffect = "move";

    setDropTargetLibraryId(targetLibraryId);
    setIsRootDropTarget(false);
  }

  async function handleMove(
    libraryId: string,
    parentId: string,
  ) {
    const previousLibraries = libraries;

    setLibraries((current) =>
      moveLibraryNode(current, libraryId, parentId),
    );

    clearDragState();

    try {
      await moveKnowledgeLibrary(libraryId, parentId);
      router.refresh();
    } catch (error) {
      console.error("No se pudo mover la biblioteca", error);
      setLibraries(previousLibraries);
      router.refresh();
    }
  }

  async function handleDropOnLibrary(
    targetLibraryId: string,
    event: DragEvent<HTMLDivElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();

    const libraryId =
      draggedLibraryId || event.dataTransfer.getData("text/plain");

    if (!libraryId || libraryId === targetLibraryId) {
      clearDragState();
      return;
    }

    const draggedLibrary = findLibraryById(libraries, libraryId);

    if (!draggedLibrary) {
      clearDragState();
      return;
    }

    if (libraryContainsId(draggedLibrary, targetLibraryId)) {
      clearDragState();
      return;
    }

    await handleMove(libraryId, targetLibraryId);
  }

  function handleDragOverRoot(event: DragEvent<HTMLDivElement>) {
    if (!draggedLibraryId || !defaultLibraryId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    event.dataTransfer.dropEffect = "move";

    setDropTargetLibraryId(null);
    setIsRootDropTarget(true);
  }

  async function handleDropOnRoot(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();

    if (!defaultLibraryId) {
      clearDragState();
      return;
    }

    const libraryId =
      draggedLibraryId || event.dataTransfer.getData("text/plain");

    if (!libraryId) {
      clearDragState();
      return;
    }

    await handleMove(libraryId, defaultLibraryId);
  }

  async function handleCreateLibrary() {
    if (!defaultLibraryId) {
      return;
    }

    const library = await createKnowledgeLibrary(defaultLibraryId);

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

    params.delete("view");
    params.set("library", id);

    router.push(`/knowledge?${params.toString()}`);
  }

  function handleSelectSharedView() {
    router.push("/knowledge?view=shared");
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

  function handleSelectView(item: SidebarItem) {
    const params = new URLSearchParams(searchParams.toString());
    const label = item.label.toLowerCase();

    params.delete("library");

    if (label.includes("favoritos")) {
      params.set("view", "favorites");
    } else if (label.includes("recientes")) {
      params.set("view", "recent");
    } else if (label.includes("públic") || label.includes("public")) {
      params.set("view", "public");
    } else if (label.includes("privad") || label.includes("private")) {
      params.set("view", "private");
    } else {
      params.delete("view");
    }

    const query = params.toString();

    router.push(query ? `/knowledge?${query}` : "/knowledge");
  }

  function isViewActive(item: SidebarItem) {
    const label = item.label.toLowerCase();

    if (label.includes("favoritos")) {
      return selectedView === "favorites";
    }

    if (label.includes("recientes")) {
      return selectedView === "recent";
    }

    if (label.includes("públic") || label.includes("public")) {
      return selectedView === "public";
    }

    if (label.includes("privad") || label.includes("private")) {
      return selectedView === "private";
    }

    return selectedView === "all" && !selectedLibraryId;
  }

  const noop = () => undefined;

  return (
    <aside
      className="min-h-0 overflow-y-auto border-r border-border bg-panel"
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
                item={{
                  ...item,
                  active: isViewActive(item),
                }}
                onSelect={() => handleSelectView(item)}
              />
            ))}
          </div>
        </div>

        <div>
          <SectionToggle
            isOpen={isMyLibraryOpen}
            label="Mi biblioteca"
            count={filteredLibraries.length}
            onToggle={() => setIsMyLibraryOpen((value) => !value)}
            action={
              <button
                className="flex h-6 w-6 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition hover:bg-surface hover:text-foreground"
                type="button"
                onClick={handleCreateLibrary}
                aria-label="Crear biblioteca"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            }
          />

          {isMyLibraryOpen ? (
            <div className="mt-2 space-y-1">
              <KnowledgeLibraryTree
                libraries={filteredLibraries}
                openMenuId={openMenuId}
                inputRefs={inputRefs}
                draggedLibraryId={draggedLibraryId}
                dropTargetLibraryId={dropTargetLibraryId}
                onRename={handleRenameLibrary}
                onSave={handleSaveLibrary}
                onToggleExpanded={handleToggleExpanded}
                onToggleMenu={(id) => {
                  setOpenMenuId((current) => {
                    if (current === id) {
                      return null;
                    }

                    return id;
                  });
                }}
                onCreateChild={handleCreateChildLibrary}
                onStartRename={handleStartRename}
                onDelete={handleDeleteLibrary}
                onSelect={handleSelectLibrary}
                onDragStart={handleDragStart}
                onDragEnd={clearDragState}
                onDragOverLibrary={handleDragOverLibrary}
                onDropLibrary={handleDropOnLibrary}
                selectedLibraryId={selectedLibraryId}
              />

<div
  className={[
    "flex items-center justify-center overflow-hidden rounded-lg border border-dashed text-xs transition-all",
    draggedLibraryId
      ? "mt-2 min-h-12"
      : "mt-0 h-0 min-h-0 border-transparent",
    isRootDropTarget
      ? "border-sky-400 bg-sky-50 text-sky-700"
      : draggedLibraryId
        ? "border-border text-muted-foreground"
        : "text-transparent",
  ].join(" ")}
  onDragOver={handleDragOverRoot}
  onDragEnter={handleDragOverRoot}
  onDragLeave={(event) => {
    const currentTarget = event.currentTarget;
    const relatedTarget = event.relatedTarget as Node | null;

    if (relatedTarget && currentTarget.contains(relatedTarget)) {
      return;
    }

    setIsRootDropTarget(false);
  }}
  onDrop={handleDropOnRoot}
>
  {draggedLibraryId ? (
    <span className="flex items-center gap-2">
      <CornerDownLeft className="h-3.5 w-3.5" />
      Mover a la raíz de Mi biblioteca
    </span>
  ) : null}
</div>

              {filteredLibraries.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  No hay bibliotecas que coincidan.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div>
          <SectionToggle
            isOpen={isSharedOpen}
            label="Compartido conmigo"
            count={filteredSharedLibraries.length}
            onToggle={() => setIsSharedOpen((value) => !value)}
            onSelect={handleSelectSharedView}
          />

          {isSharedOpen ? (
            <div className="mt-2 space-y-1">
              <KnowledgeLibraryTree
                libraries={buildReadonlyLibraryTree(
                  filteredSharedLibraries,
                )}
                readonly
                openMenuId={null}
                inputRefs={inputRefs}
                onRename={noop}
                onSave={noop}
                onToggleExpanded={toggleReadonlyLibrary}
                onToggleMenu={noop}
                onCreateChild={noop}
                onStartRename={noop}
                onDelete={noop}
                selectedLibraryId={selectedLibraryId}
                onSelect={handleSelectLibrary}
              />

              {filteredSharedLibraries.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  No tienes bibliotecas compartidas.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div>
          <SectionToggle
            isOpen={isTeamsOpen}
            label="Mis equipos"
            count={teamGroups.length}
            onToggle={() => setIsTeamsOpen((value) => !value)}
          />

          {isTeamsOpen ? (
            <div className="mt-2 space-y-2">
              {teamGroups.map((team) => {
                const isTeamOpen = openTeamIds[team.id] ?? true;

                return (
                  <div key={team.id}>
                    <button
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-panel-foreground/70 transition hover:bg-surface-hover hover:text-foreground"
                      type="button"
                      onClick={() => {
                        setOpenTeamIds((current) => ({
                          ...current,
                          [team.id]: !isTeamOpen,
                        }));
                      }}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        {isTeamOpen ? (
                          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                        )}

                        <UsersRound className="h-4 w-4 shrink-0" />

                        <span className="truncate">{team.name}</span>
                      </span>

                      <span className="text-xs text-muted-foreground">
                        {team.libraries.length}
                      </span>
                    </button>

                    {isTeamOpen ? (
                      <div className="mt-1 space-y-1 pl-5">
                        {team.libraries.length > 0 ? (
                          <KnowledgeLibraryTree
                            libraries={buildReadonlyLibraryTree(
                              team.libraries,
                            )}
                            readonly
                            openMenuId={null}
                            inputRefs={inputRefs}
                            onRename={noop}
                            onSave={noop}
                            onToggleExpanded={toggleReadonlyLibrary}
                            onToggleMenu={noop}
                            onCreateChild={noop}
                            onStartRename={noop}
                            onDelete={noop}
                            selectedLibraryId={selectedLibraryId}
                            onSelect={handleSelectLibrary}
                          />
                        ) : (
                          <p className="px-3 py-2 text-xs text-muted-foreground">
                            Sin bibliotecas compartidas.
                          </p>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}

              {teamGroups.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  No perteneces a ningún equipo.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

function SectionToggle({
  isOpen,
  label,
  count,
  action,
  onToggle,
  onSelect,
}: {
  isOpen: boolean;
  label: string;
  count: number;
  action?: ReactNode;
  onToggle: () => void;
  onSelect?: () => void;
}) {
  return (
    <div className="group flex items-center justify-between px-2">
      <div className="flex min-w-0 items-center">
        <button
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-surface hover:text-foreground"
          type="button"
          onClick={onToggle}
          aria-label={isOpen ? "Contraer sección" : "Expandir sección"}
        >
          {isOpen ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>

        <button
          className="min-w-0 truncate text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
          type="button"
          onClick={onSelect ?? onToggle}
        >
          {label}

          <span className="ml-1 text-[10px] font-normal">
            ({count})
          </span>
        </button>
      </div>

      {action ? (
        <div className="opacity-0 transition group-hover:opacity-100">
          {action}
        </div>
      ) : null}
    </div>
  );
}