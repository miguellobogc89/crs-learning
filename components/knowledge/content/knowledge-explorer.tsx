// components/knowledge/content/knowledge-explorer.tsx
"use client";

import {
  useState,
  type DragEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Clock,
  FileStack,
  FileText,
  Folder,
  FolderTree,
  FileSearch,
  Plus,
  UsersRound,
} from "lucide-react";
import { KnowledgeEmptyState } from "./knowledge-empty-state";
import { moveKnowledgeLibrary } from "@/lib/actions/knowledge-library.actions";

import { KnowledgeCard } from "./knowledge-card";
import { KnowledgeFolderCard } from "./knowledge-folder-card";
import { KnowledgeImportFlow } from "@/components/knowledge/import/knowledge-import-flow";

type KnowledgeLibrary = {
  id: string;
  parent_id: string | null;
  name: string;
  is_shared?: boolean;
  created_at?: Date | string | null;
  updated_at?: Date | string | null;
  article_count?: number;
  folder_count?: number;
  file_count?: number;
};

type KnowledgeSource = {
  id: string;
  title: string;
  description?: string | null;
  content?: string | null;
  summary?: string | null;
  language?: string | null;
  domain?: string | null;
  level?: string | null;
  tags?: unknown;
  status?: string | null;
  visibility?: string | null;
  updated_at?: Date | string | null;
  knowledge_type?: string | null;
  confidence?: number | null;
};

type DraggedItem =
  | {
      type: "folder";
      id: string;
    }
  | {
      type: "article";
      id: string;
    };

type Props = {
  folders: KnowledgeLibrary[];
  knowledgeSources: KnowledgeSource[];
  viewMode: "grid" | "list";
  selectedLibraryId: string | null;
  selectedView: string;
  canCreateArticle: boolean;
  search: string;
  onCreateArticle: () => void;
};

function getStatusLabel(status: string | null | undefined) {
  if (status === "ready" || status === "processed") {
    return "IA procesada";
  }

  if (status === "processing") {
    return "Procesando";
  }

  if (status === "error") {
    return "Error";
  }

  return "Borrador";
}

function getSummary(knowledge: KnowledgeSource) {
  return (
    knowledge.summary?.trim() ||
    knowledge.description?.trim() ||
    knowledge.content?.trim() ||
    ""
  );
}

function formatRelativeDate(date: Date | string | null | undefined) {
  if (!date) {
    return "Sin fecha";
  }

  const timestamp = new Date(date).getTime();

  const diffMinutes = Math.max(
    1,
    Math.floor((Date.now() - timestamp) / 60000),
  );

  if (diffMinutes < 60) {
    return `Hace ${diffMinutes} min`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `Hace ${diffHours} h`;
  }

  const diffDays = Math.floor(diffHours / 24);

  if (diffDays < 30) {
    return `Hace ${diffDays} días`;
  }

  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

function getFolderIcon(folder: KnowledgeLibrary) {
  if (folder.is_shared) {
    return (
      <UsersRound
        className="h-5 w-5 text-brand"
        strokeWidth={2.25}
      />
    );
  }

  return <Folder className="h-5 w-5" strokeWidth={2.25} />;
}

export function KnowledgeExplorer({
  folders,
  knowledgeSources,
  viewMode,
  selectedLibraryId,
  selectedView,
  canCreateArticle,
  search,
  onCreateArticle,
}: Props) {
  const router = useRouter();

  const [draggedItem, setDraggedItem] =
    useState<DraggedItem | null>(null);

  const [dropTargetFolderId, setDropTargetFolderId] =
    useState<string | null>(null);

  const [isMoving, setIsMoving] = useState(false);

  const [showImport, setShowImport] = useState(false);

  const isSearchEmpty =
  search.trim().length > 0 &&
  folders.length === 0 &&
  knowledgeSources.length === 0;

  const isEmpty =
    folders.length === 0 && knowledgeSources.length === 0;

  function clearDragState() {
    setDraggedItem(null);
    setDropTargetFolderId(null);
  }

  function handleDragStart(
    item: DraggedItem,
    event: DragEvent<HTMLElement>,
  ) {
    setDraggedItem(item);
    setDropTargetFolderId(null);

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(
      "application/x-knowledge-item",
      JSON.stringify(item),
    );
  }

  function handleDragOverFolder(
    folder: KnowledgeLibrary,
    event: DragEvent<HTMLElement>,
  ) {
    if (!draggedItem || folder.is_shared || isMoving) {
      return;
    }

    if (
      draggedItem.type === "folder" &&
      draggedItem.id === folder.id
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    event.dataTransfer.dropEffect = "move";
    setDropTargetFolderId(folder.id);
  }

  function handleDragLeaveFolder(
    folderId: string,
    event: DragEvent<HTMLElement>,
  ) {
    const nextTarget = event.relatedTarget;

    if (
      nextTarget instanceof Node &&
      event.currentTarget.contains(nextTarget)
    ) {
      return;
    }

    if (dropTargetFolderId === folderId) {
      setDropTargetFolderId(null);
    }
  }

  async function handleDropOnFolder(
    folder: KnowledgeLibrary,
    event: DragEvent<HTMLElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();

    if (folder.is_shared || isMoving) {
      clearDragState();
      return;
    }

    let item = draggedItem;

    if (!item) {
      const rawItem = event.dataTransfer.getData(
        "application/x-knowledge-item",
      );

      if (rawItem) {
        item = JSON.parse(rawItem) as DraggedItem;
      }
    }

    if (!item) {
      clearDragState();
      return;
    }

    if (item.type === "folder" && item.id === folder.id) {
      clearDragState();
      return;
    }

    setIsMoving(true);

    try {
if (item.type === "folder") {
  await moveKnowledgeLibrary(item.id, folder.id);
} else {
  const response = await fetch("/api/knowledge/move", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      knowledgeId: item.id,
      libraryId: folder.id,
    }),
  });

  if (!response.ok) {
    throw new Error("No se ha podido mover");
  }
}

toast.success(
  item.type === "folder"
    ? "Carpeta movida"
    : "Artículo movido",
  {
    description: `Movido a "${folder.name}".`,
  },
);

router.refresh();
    } catch (error) {
      console.error(error);

toast.error("No se ha podido mover", {
  description: "Ha ocurrido un error al mover el elemento.",
});
    } finally {
      setIsMoving(false);
      clearDragState();
    }
  }

  if (isSearchEmpty) {
  return (
    <KnowledgeEmptyState
      icon={<FileSearch className="h-5 w-5" />}
      title="No se han encontrado resultados"
      description="Prueba con otro término de búsqueda o elimina los filtros para ver más contenido."
    />
  );
}

  if (isEmpty) {
if (selectedView === "shared") {
  return (
    <KnowledgeEmptyState
      icon={<UsersRound className="h-5 w-5" />}
      title="Todavía no tienes contenido compartido"
      description="Cuando otro equipo comparta una carpeta contigo aparecerá aquí."
    />
  );
}

if (selectedLibraryId && canCreateArticle) {
<KnowledgeImportFlow
  libraryId={selectedLibraryId}
  libraryName="Carpeta"
  onCreateArticle={onCreateArticle}
/>
}

return (
  <KnowledgeEmptyState
    icon={<FolderTree className="h-5 w-5" />}
    title="Tu biblioteca está vacía"
    description="Crea una carpeta para empezar a organizar el conocimiento de tu empresa."
  />
);
  }

  if (viewMode === "list") {
    return (
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="grid grid-cols-[minmax(260px,1fr)_180px_140px_150px] border-b border-border px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <div>Nombre</div>
          <div>Contenido</div>
          <div>Tipo</div>
          <div>Actualización</div>
        </div>

        <div className="divide-y divide-border">
          {folders.map((folder) => (
            <div
              key={folder.id}
              draggable={!folder.is_shared && !isMoving}
              onDragStart={(event) =>
                handleDragStart(
                  {
                    type: "folder",
                    id: folder.id,
                  },
                  event,
                )
              }
              onDragEnd={clearDragState}
              onDragOver={(event) =>
                handleDragOverFolder(folder, event)
              }
              onDragLeave={(event) =>
                handleDragLeaveFolder(folder.id, event)
              }
              onDrop={(event) =>
                handleDropOnFolder(folder, event)
              }
              className={[
                "transition",
                dropTargetFolderId === folder.id
                  ? "bg-primary/10"
                  : "",
              ].join(" ")}
            >
              <Link
                href={`/knowledge?library=${folder.id}`}
                className="grid grid-cols-[minmax(260px,1fr)_180px_140px_150px] items-center px-4 py-3 text-sm hover:bg-surface"
              >
                <div className="flex min-w-0 items-center gap-3 font-medium text-foreground">
                  {getFolderIcon(folder)}
                  <span className="truncate">{folder.name}</span>
                </div>

                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5" />
                    {folder.article_count ?? 0}
                  </span>

                  <span className="flex items-center gap-1">
                    <FileStack className="h-3.5 w-3.5" />
                    {folder.file_count ?? 0}
                  </span>

                  <span className="flex items-center gap-1">
                    <FolderTree className="h-3.5 w-3.5" />
                    {folder.folder_count ?? 0}
                  </span>
                </div>

                <div className="text-muted-foreground">
                  {folder.is_shared ? "Compartida" : "Carpeta"}
                </div>

                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {formatRelativeDate(folder.updated_at)}
                </div>
              </Link>
            </div>
          ))}

          {knowledgeSources.map((knowledge) => (
            <div
              key={knowledge.id}
              draggable={!isMoving}
              onDragStart={(event) =>
                handleDragStart(
                  {
                    type: "article",
                    id: knowledge.id,
                  },
                  event,
                )
              }
              onDragEnd={clearDragState}
            >
              <Link
                href={`/knowledge/${knowledge.id}`}
                className="grid grid-cols-[minmax(260px,1fr)_180px_140px_150px] items-center px-4 py-3 text-sm hover:bg-surface"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <FileText
                    className="h-5 w-5 shrink-0 text-muted-foreground"
                    strokeWidth={2.25}
                  />

                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">
                      {knowledge.title}
                    </p>

                    {getSummary(knowledge) ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {getSummary(knowledge)}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="truncate text-muted-foreground">
                  {knowledge.domain ?? "—"}
                </div>

                <div className="text-muted-foreground">
                  {getStatusLabel(knowledge.status)}
                </div>

                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {formatRelativeDate(knowledge.updated_at)}
                </div>
              </Link>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {folders.map((folder) => {
        if (folder.is_shared) {
          return (
            <Link
              key={folder.id}
              href={`/knowledge?library=${folder.id}`}
              className="rounded-2xl border border-border bg-card p-5 transition hover:bg-surface"
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand">
                <UsersRound className="h-5 w-5" />
              </div>

              <h3 className="font-semibold">{folder.name}</h3>

              <p className="mt-1 text-sm text-muted-foreground">
                Biblioteca compartida contigo.
              </p>
            </Link>
          );
        }

return (
  <KnowledgeFolderCard
    key={folder.id}
    folder={folder}
    draggable={!isMoving}
    isDropTarget={dropTargetFolderId === folder.id}
    onDragStart={(event) =>
      handleDragStart(
        {
          type: "folder",
          id: folder.id,
        },
        event,
      )
    }
    onDragEnd={clearDragState}
    onDragOver={(event) =>
      handleDragOverFolder(folder, event)
    }
    onDragLeave={(event) =>
      handleDragLeaveFolder(folder.id, event)
    }
    onDrop={(event) =>
      handleDropOnFolder(folder, event)
    }
  />
);
      })}

      {knowledgeSources.map((knowledge) => (
        <div
          key={knowledge.id}
          draggable={!isMoving}
          onDragStart={(event) =>
            handleDragStart(
              {
                type: "article",
                id: knowledge.id,
              },
              event,
            )
          }
          onDragEnd={clearDragState}
        >
          <KnowledgeCard knowledge={knowledge} />
        </div>
      ))}
    </div>
  );
}