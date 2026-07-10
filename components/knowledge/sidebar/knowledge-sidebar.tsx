// components/knowledge/sidebar/knowledge-sidebar.tsx
"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Plus, UsersRound } from "lucide-react";

import { KnowledgeViewItem } from "./knowledge-view-item";
import { SearchInput } from "@/components/ui/search-input";
import {
  createKnowledgeLibrary,
  deleteKnowledgeLibrary,
  renameKnowledgeLibrary,
} from "@/lib/actions/knowledge-library.actions";
import type { LibraryItem, SidebarItem } from "./types";
import { KnowledgeLibraryTree } from "./knowledge-library-tree";
import {
  buildLibraryTree,
  deleteLibrary,
  findLibraryById,
  renameLibrary,
  saveLibraries,
  startRename,
  toggleLibrary,
} from "./tree-utils";
import { useRouter, useSearchParams } from "next/navigation";

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

function toLibraryItems(libraries: KnowledgeLibrary[]): LibraryItem[] {
  return libraries.map((library) => ({
    id: library.id,
    name: library.name,
    isExpanded: true,
    is_shared: library.is_shared,
    children: [],
  }));
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

  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedView = searchParams.get("view") ?? "all";
  const selectedLibraryId = searchParams.get("library");

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

  const teamGroups = useMemo(() => {
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

  const filteredSharedLibraries = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    if (!normalizedSearch) {
      return sharedKnowledgeLibraries;
    }

    return sharedKnowledgeLibraries.filter((library) =>
      library.name.toLowerCase().includes(normalizedSearch),
    );
  }, [sharedKnowledgeLibraries, search]);

  async function handleCreateLibrary() {
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
                onRename={handleRenameLibrary}
                onSave={handleSaveLibrary}
                onToggleExpanded={handleToggleExpanded}
                onToggleMenu={(id) =>
                  setOpenMenuId((current) => {
                    if (current === id) {
                      return null;
                    }

                    return id;
                  })
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
                libraries={toLibraryItems(filteredSharedLibraries)}
                readonly
                openMenuId={null}
                inputRefs={inputRefs}
                onRename={noop}
                onSave={noop}
                onToggleExpanded={noop}
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
                      onClick={() =>
                        setOpenTeamIds((current) => ({
                          ...current,
                          [team.id]: !isTeamOpen,
                        }))
                      }
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
                            libraries={toLibraryItems(team.libraries)}
                            readonly
                            openMenuId={null}
                            inputRefs={inputRefs}
                            onRename={noop}
                            onSave={noop}
                            onToggleExpanded={noop}
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
      <button
        className="flex min-w-0 items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
        type="button"
        onClick={onSelect ?? onToggle}
      >
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        )}

        <span className="truncate">{label}</span>

        <span className="ml-1 text-[10px] font-normal">({count})</span>
      </button>

      <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
        {action}

        <button
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition hover:bg-surface hover:text-foreground"
          type="button"
          onClick={onToggle}
          aria-label="Expandir sección"
        >
          {isOpen ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}