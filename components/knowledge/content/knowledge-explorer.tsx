// components/knowledge/content/knowledge-explorer.tsx

"use client";

import {
  useState,
  type DragEvent,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  FileStack,
  FileSearch,
  FolderTree,
  UsersRound,
} from "lucide-react";

import { KnowledgeEmptyState } from "./knowledge-empty-state";
import { KnowledgeEmptyFolder } from "./knowledge-empty-folder";
import { KnowledgeItemCard } from "./cards/knowledge-item-card";
import {
  KnowledgeList,
  type KnowledgeListFolder,
  type KnowledgeListSource,
} from "./knowledge-list";

import { moveKnowledgeLibrary } from "@/lib/actions/knowledge-library.actions";

type KnowledgeLibrary =
  KnowledgeListFolder;

type KnowledgeSource =
  KnowledgeListSource;

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
  search: string;
  selectedArticleIds: Set<string>;
  selectedFolderIds: Set<string>;
  onUploadRequested?: () => void;
  onUploadFolderRequested?: () => void;
  onCreateFolderRequested?: () => void;
  onFilesDropped?: (
    files: File[],
  ) => void;

  onArticleSelectedChange: (
    id: string,
    selected: boolean,
  ) => void;

  onFolderSelectedChange: (
    id: string,
    selected: boolean,
  ) => void;
};

export function KnowledgeExplorer({
  folders,
  knowledgeSources,
  viewMode,
  selectedLibraryId,
  selectedView,
  search,
  selectedArticleIds,
  selectedFolderIds,
  onUploadRequested,
  onArticleSelectedChange,
  onFolderSelectedChange,
  onUploadFolderRequested,
  onCreateFolderRequested,
  onFilesDropped,
}: Props) {
  const router = useRouter();

  const [draggedItem, setDraggedItem] =
    useState<DraggedItem | null>(null);

  const [
    dropTargetFolderId,
    setDropTargetFolderId,
  ] = useState<string | null>(null);

  const [isMoving, setIsMoving] =
    useState(false);

  const isSearchEmpty =
    search.trim().length > 0 &&
    folders.length === 0 &&
    knowledgeSources.length === 0;

  const isEmpty =
    folders.length === 0 &&
    knowledgeSources.length === 0;

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

    event.dataTransfer.effectAllowed =
      "move";

    event.dataTransfer.setData(
      "application/x-knowledge-item",
      JSON.stringify(item),
    );
  }

  function handleDragOverFolder(
    folder: KnowledgeLibrary,
    event: DragEvent<HTMLElement>,
  ) {
    if (
      !draggedItem ||
      folder.is_shared ||
      isMoving
    ) {
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

    event.dataTransfer.dropEffect =
      "move";

    setDropTargetFolderId(
      folder.id,
    );
  }

  function handleDragLeaveFolder(
    folderId: string,
    event: DragEvent<HTMLElement>,
  ) {
    const nextTarget =
      event.relatedTarget;

    if (
      nextTarget instanceof Node &&
      event.currentTarget.contains(
        nextTarget,
      )
    ) {
      return;
    }

    if (
      dropTargetFolderId === folderId
    ) {
      setDropTargetFolderId(null);
    }
  }

  async function handleDropOnFolder(
    folder: KnowledgeLibrary,
    event: DragEvent<HTMLElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();

    if (
      folder.is_shared ||
      isMoving
    ) {
      clearDragState();
      return;
    }

    let item = draggedItem;

    if (!item) {
      const rawItem =
        event.dataTransfer.getData(
          "application/x-knowledge-item",
        );

      if (rawItem) {
        item = JSON.parse(
          rawItem,
        ) as DraggedItem;
      }
    }

    if (!item) {
      clearDragState();
      return;
    }

    if (
      item.type === "folder" &&
      item.id === folder.id
    ) {
      clearDragState();
      return;
    }

    setIsMoving(true);

    try {
      if (item.type === "folder") {
        await moveKnowledgeLibrary(
          item.id,
          folder.id,
        );
      } else {
        const response = await fetch(
          "/api/knowledge/move",
          {
            method: "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              knowledgeId: item.id,
              libraryId: folder.id,
            }),
          },
        );

        if (!response.ok) {
          throw new Error(
            "No se ha podido mover",
          );
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

      toast.error(
        "No se ha podido mover",
        {
          description:
            "Ha ocurrido un error al mover el elemento.",
        },
      );
    } finally {
      setIsMoving(false);
      clearDragState();
    }
  }

  if (isSearchEmpty) {
    return (
      <KnowledgeEmptyState
        icon={
          <FileSearch className="h-5 w-5" />
        }
        title="No se han encontrado resultados"
        description="Knowledge te ayuda a encontrar documentacion y articulos autorizados. Prueba con otro termino o elimina filtros para ampliar la busqueda."
      />
    );
  }

  if (isEmpty) {
    if (selectedView === "shared") {
      return (
        <KnowledgeEmptyState
          icon={
            <UsersRound className="h-5 w-5" />
          }
          title="Todavía no tienes contenido compartido"
          description="Aqui apareceran carpetas que otros equipos compartan contigo para trabajar con conocimiento comun."
        />
      );
    }

    if (selectedLibraryId) {
      return (
        <KnowledgeEmptyFolder
          onUploadFiles={() =>
            onUploadRequested?.()
          }
          onUploadFolder={() =>
            onUploadFolderRequested?.()
          }
          onCreateFolder={() =>
            onCreateFolderRequested?.()
          }
          onFilesDropped={(files) =>
            onFilesDropped?.(files)
          }
        />
      );
    }

    return (
      <KnowledgeEmptyState
        icon={
          <FolderTree className="h-5 w-5" />
        }
        title="Tu biblioteca está vacía"
        description="Centraliza documentacion para que el asistente pueda trabajar con el conocimiento de tu organizacion."
        actionLabel="Subir documentacion"
        actionIcon={
          <FileStack className="h-4 w-4" />
        }
        onAction={
          onUploadRequested
        }
      />
    );
  }

  if (viewMode === "list") {
    return (
      <KnowledgeList
        folders={folders}
        knowledgeSources={
          knowledgeSources
        }
        isMoving={isMoving}
        dropTargetFolderId={
          dropTargetFolderId
        }
        onFolderDragStart={(
          folder,
          event,
        ) =>
          handleDragStart(
            {
              type: "folder",
              id: folder.id,
            },
            event,
          )
        }
        onArticleDragStart={(
          knowledge,
          event,
        ) =>
          handleDragStart(
            {
              type: "article",
              id: knowledge.id,
            },
            event,
          )
        }
        onDragEnd={
          clearDragState
        }
        onFolderDragOver={
          handleDragOverFolder
        }
        onFolderDragLeave={
          handleDragLeaveFolder
        }
        onFolderDrop={
          handleDropOnFolder
        }
      />
    );
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-1 grid-rows-[repeat(12,minmax(0,1fr))] gap-4 sm:grid-cols-2 sm:grid-rows-[repeat(6,minmax(0,1fr))] xl:grid-cols-3 xl:grid-rows-[repeat(4,minmax(0,1fr))] 2xl:grid-cols-4 2xl:grid-rows-[repeat(3,minmax(0,1fr))]">
      {folders.map((folder) => (
        <KnowledgeItemCard
          key={folder.id}
          itemType="folder"
          folder={folder}
          selected={
            selectedFolderIds.has(
              folder.id,
            )
          }
          onSelectedChange={(
            selected,
          ) =>
            onFolderSelectedChange(
              folder.id,
              selected,
            )
          }
          draggable={
            !folder.is_shared &&
            !isMoving
          }
          isDropTarget={
            dropTargetFolderId ===
            folder.id
          }
          onDragStart={(event) =>
            handleDragStart(
              {
                type: "folder",
                id: folder.id,
              },
              event,
            )
          }
          onDragEnd={
            clearDragState
          }
          onDragOver={(event) =>
            handleDragOverFolder(
              folder,
              event,
            )
          }
          onDragLeave={(event) =>
            handleDragLeaveFolder(
              folder.id,
              event,
            )
          }
          onDrop={(event) =>
            handleDropOnFolder(
              folder,
              event,
            )
          }
        />
      ))}

      {knowledgeSources.map(
        (knowledge) => (
          <KnowledgeItemCard
            key={knowledge.id}
            itemType="article"
            knowledge={knowledge}
            selected={
              selectedArticleIds.has(
                knowledge.id,
              )
            }
            onSelectedChange={(
              selected,
            ) =>
              onArticleSelectedChange(
                knowledge.id,
                selected,
              )
            }
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
            onDragEnd={
              clearDragState
            }
          />
        ),
      )}
    </div>
  );
}