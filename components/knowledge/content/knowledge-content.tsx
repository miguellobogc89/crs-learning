// components/knowledge/content/knowledge-content.tsx

"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

import { AppCard } from "@/components/app/layouts/app-card";
import { AppPagination } from "@/components/app/layouts/app-pagination";
import { KnowledgeImportModal } from "@/components/knowledge/import/modal";
import {
  buildLibraryTree,
  getLibraryPath,
} from "@/components/knowledge/sidebar/tree-utils";

import { CreateFolderDialog } from "./create-folder-dialog";
import { KnowledgeExplorer } from "./knowledge-explorer";
import { KnowledgeLibraryBreadcrumb } from "./knowledge-library-breadcrumb";
import { KnowledgeToolbar } from "./toolbar/knowledge-toolbar";

import type {
  ExplorerState,
  ExplorerStatus,
  UploadType,
} from "./toolbar/types";

const PAGE_SIZE = 12;

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
  keywords?: unknown;
  entities?: unknown;
  status?: string | null;
  visibility?: string | null;
  updated_at?: Date | string | null;
  knowledge_type?: string | null;
  confidence?: number | null;
  library_id?: string | null;
};

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

type Props = {
  knowledgeSources: KnowledgeSource[];
  knowledgeLibraries: KnowledgeLibrary[];
  selectedLibraryId: string | null;
  selectedView: string;
};

function normalizeSearchValue(value: unknown) {
  if (!Array.isArray(value)) {
    return "";
  }

  return value
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }

      if (
        item &&
        typeof item === "object" &&
        "name" in item
      ) {
        return String(item.name);
      }

      return "";
    })
    .join(" ");
}

function normalizeArticleStatus(
  status: string | null | undefined,
): ExplorerStatus {
  if (status === "ready" || status === "processed") {
    return "ready";
  }

  if (status === "processing") {
    return "processing";
  }

  if (status === "error") {
    return "error";
  }

  return "draft";
}

function getDateTimestamp(
  value: Date | string | null | undefined,
) {
  if (!value) {
    return 0;
  }

  const timestamp = new Date(value).getTime();

  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function KnowledgeContent({
  knowledgeSources,
  knowledgeLibraries,
  selectedLibraryId,
  selectedView,
}: Props) {
  const [explorerState, setExplorerState] =
    useState<ExplorerState>({
      search: "",
      viewMode: "grid",
      sort: "updated_desc",
      itemType: "all",
      status: "all",
    });

  const [page, setPage] = useState(1);

  const [isCreateFolderOpen, setIsCreateFolderOpen] =
    useState(false);

  const [
    isKnowledgeImportOpen,
    setIsKnowledgeImportOpen,
  ] = useState(false);

  const [selectedFiles, setSelectedFiles] =
    useState<File[]>([]);

  const [selectedArticleIds, setSelectedArticleIds] =
    useState<Set<string>>(new Set());

  const [selectedFolderIds, setSelectedFolderIds] =
    useState<Set<string>>(new Set());

  const filesInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  const selectedCount =
    selectedArticleIds.size + selectedFolderIds.size;

  function toggleArticleSelection(
    id: string,
    selected: boolean,
  ) {
    setSelectedArticleIds((current) => {
      const next = new Set(current);

      if (selected) {
        next.add(id);
      } else {
        next.delete(id);
      }

      return next;
    });
  }

  function toggleFolderSelection(
    id: string,
    selected: boolean,
  ) {
    setSelectedFolderIds((current) => {
      const next = new Set(current);

      if (selected) {
        next.add(id);
      } else {
        next.delete(id);
      }

      return next;
    });
  }

  function clearSelection() {
    setSelectedArticleIds(new Set());
    setSelectedFolderIds(new Set());
  }

  const selectedLibrary = useMemo(() => {
    return knowledgeLibraries.find(
      (library) => library.id === selectedLibraryId,
    );
  }, [knowledgeLibraries, selectedLibraryId]);

  // La vista general representa la carpeta real «Mi biblioteca».
  // Dentro de una subcarpeta conservamos su ID.
  const currentFolderId = useMemo(() => {
    if (selectedLibraryId) {
      return selectedLibraryId;
    }

    const rootLibraries = knowledgeLibraries.filter(
      (library) =>
        library.parent_id === null &&
        library.name === "Mi biblioteca" &&
        !library.is_shared,
    );

    return rootLibraries.length === 1
      ? rootLibraries[0].id
      : null;
  }, [knowledgeLibraries, selectedLibraryId]);

  const baseChildLibraries = useMemo(() => {
    if (selectedView === "shared") {
      return knowledgeLibraries.filter(
        (library) => library.is_shared,
      );
    }

    return knowledgeLibraries.filter((library) => {
      if (library.is_shared) {
        return false;
      }

      return library.parent_id === currentFolderId;
    });
  }, [
    knowledgeLibraries,
    currentFolderId,
    selectedView,
  ]);

  const processedLibraries = useMemo(() => {
    if (
      explorerState.itemType === "articles" ||
      explorerState.status !== "all"
    ) {
      return [];
    }

    const searchValue = explorerState.search
      .trim()
      .toLocaleLowerCase("es");

    const filtered = baseChildLibraries.filter(
      (library) => {
        if (!searchValue) {
          return true;
        }

        return library.name
          .toLocaleLowerCase("es")
          .includes(searchValue);
      },
    );

    return [...filtered].sort((first, second) => {
      if (explorerState.sort === "name_asc") {
        return first.name.localeCompare(
          second.name,
          "es",
          { sensitivity: "base" },
        );
      }

      if (explorerState.sort === "name_desc") {
        return second.name.localeCompare(
          first.name,
          "es",
          { sensitivity: "base" },
        );
      }

      const firstDate = getDateTimestamp(
        first.updated_at,
      );

      const secondDate = getDateTimestamp(
        second.updated_at,
      );

      if (explorerState.sort === "updated_asc") {
        return firstDate - secondDate;
      }

      return secondDate - firstDate;
    });
  }, [
    baseChildLibraries,
    explorerState.itemType,
    explorerState.search,
    explorerState.sort,
    explorerState.status,
  ]);

  const processedKnowledge = useMemo(() => {
    if (explorerState.itemType === "folders") {
      return [];
    }

    const searchValue = explorerState.search
      .trim()
      .toLocaleLowerCase("es");

    const filtered = knowledgeSources.filter(
      (item) => {
        const normalizedStatus =
          normalizeArticleStatus(item.status);

        if (
          explorerState.status !== "all" &&
          normalizedStatus !== explorerState.status
        ) {
          return false;
        }

        if (!searchValue) {
          return true;
        }

        const searchableText = [
          item.title,
          item.description,
          item.content,
          item.summary,
          item.language,
          item.domain,
          item.level,
          item.knowledge_type,
          item.visibility,
          normalizeSearchValue(item.tags),
          normalizeSearchValue(item.keywords),
          normalizeSearchValue(item.entities),
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("es");

        return searchableText.includes(searchValue);
      },
    );

    return [...filtered].sort((first, second) => {
      if (explorerState.sort === "name_asc") {
        return first.title.localeCompare(
          second.title,
          "es",
          { sensitivity: "base" },
        );
      }

      if (explorerState.sort === "name_desc") {
        return second.title.localeCompare(
          first.title,
          "es",
          { sensitivity: "base" },
        );
      }

      if (explorerState.sort === "status") {
        return normalizeArticleStatus(
          first.status,
        ).localeCompare(
          normalizeArticleStatus(second.status),
          "es",
        );
      }

      const firstDate = getDateTimestamp(
        first.updated_at,
      );

      const secondDate = getDateTimestamp(
        second.updated_at,
      );

      if (explorerState.sort === "updated_asc") {
        return firstDate - secondDate;
      }

      return secondDate - firstDate;
    });
  }, [
    knowledgeSources,
    explorerState.itemType,
    explorerState.search,
    explorerState.sort,
    explorerState.status,
  ]);

  // Paginamos el conjunto visible: primero carpetas,
  // después documentos, respetando el orden del explorador.
  const totalItems =
    processedLibraries.length +
    processedKnowledge.length;

  const totalPages = Math.max(
    1,
    Math.ceil(totalItems / PAGE_SIZE),
  );

  const currentPage = Math.min(page, totalPages);

  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;

    const visibleFolders =
      processedLibraries.slice(start, end);

    const documentStart = Math.max(
      0,
      start - processedLibraries.length,
    );

    const remainingSlots =
      PAGE_SIZE - visibleFolders.length;

    const visibleKnowledge =
      remainingSlots > 0
        ? processedKnowledge.slice(
            documentStart,
            documentStart + remainingSlots,
          )
        : [];

    return {
      folders: visibleFolders,
      knowledgeSources: visibleKnowledge,
    };
  }, [
    currentPage,
    processedLibraries,
    processedKnowledge,
  ]);

  const libraryTree = useMemo(() => {
    return buildLibraryTree(knowledgeLibraries);
  }, [knowledgeLibraries]);

  const libraryPath = useMemo(() => {
    return getLibraryPath(
      libraryTree,
      selectedLibraryId,
    );
  }, [libraryTree, selectedLibraryId]);

  const currentLibrary =
    libraryPath[libraryPath.length - 1];

  let pageTitle = "Mi biblioteca";

  if (selectedView === "shared") {
    pageTitle = "Compartido conmigo";
  } else if (selectedView === "public") {
    pageTitle = "Conocimiento público";
  } else if (selectedView === "private") {
    pageTitle = "Documentos privados";
  } else if (currentLibrary) {
    pageTitle = currentLibrary.name;
  }

  let parentHref: string | null = null;

  if (selectedView !== "all") {
    parentHref = "/knowledge";
  } else if (selectedLibrary) {
    if (selectedLibrary.parent_id) {
      parentHref = `/knowledge?library=${encodeURIComponent(
        selectedLibrary.parent_id,
      )}`;
    } else {
      parentHref = "/knowledge";
    }
  }

  function handleFilesSelected(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const files = Array.from(
      event.target.files ?? [],
    );

    if (files.length === 0) {
      return;
    }

    setSelectedFiles(files);
    setIsKnowledgeImportOpen(true);

    event.target.value = "";
  }

  function handleUpload(type: UploadType) {
    if (type === "files") {
      filesInputRef.current?.click();
      return;
    }

    if (type === "folder") {
      folderInputRef.current?.click();
      return;
    }

    zipInputRef.current?.click();
  }

  useEffect(() => {
    function handleTopbarUpload(event: Event) {
      const uploadEvent =
        event as CustomEvent<UploadType>;

      if (
        uploadEvent.detail === "files" ||
        uploadEvent.detail === "folder" ||
        uploadEvent.detail === "zip"
      ) {
        handleUpload(uploadEvent.detail);
      }
    }

    window.addEventListener(
      "crs:knowledge-upload",
      handleTopbarUpload,
    );

    return () => {
      window.removeEventListener(
        "crs:knowledge-upload",
        handleTopbarUpload,
      );
    };
  }, []);

  return (
    <>
      <KnowledgeToolbar
        explorerState={explorerState}
        onExplorerStateChange={(nextState) => {
          setExplorerState(nextState);
          setPage(1);
        }}
        title={pageTitle}
        parentHref={parentHref}
        breadcrumb={
          selectedView === "shared" ? (
            <div className="truncate text-sm text-muted-foreground">
              Mi biblioteca / Compartido conmigo
            </div>
          ) : selectedView === "public" ? (
            <div className="truncate text-sm text-muted-foreground">
              Mi biblioteca / Conocimiento público
            </div>
          ) : selectedView === "private" ? (
            <div className="truncate text-sm text-muted-foreground">
              Mi biblioteca / Documentos privados
            </div>
          ) : libraryPath.length > 0 ? (
            <KnowledgeLibraryBreadcrumb
              path={libraryPath}
            />
          ) : (
            <div className="truncate text-sm text-muted-foreground">
              Mi biblioteca
            </div>
          )
        }
        onCreateFolder={() => {
          if (!currentFolderId) {
            window.alert(
              "No se ha encontrado la carpeta «Mi biblioteca». Recarga la página antes de crear una carpeta.",
            );
            return;
          }

          setIsCreateFolderOpen(true);
        }}
        onUpload={handleUpload}
        selectedCount={selectedCount}
        onClearSelection={clearSelection}
      />

      <AppCard className="overflow-hidden p-0">
        <div className="min-h-[320px] p-5 sm:p-6">
          <KnowledgeExplorer
            folders={paginatedItems.folders}
            knowledgeSources={
              paginatedItems.knowledgeSources
            }
            viewMode={explorerState.viewMode}
            selectedLibraryId={selectedLibraryId}
            selectedView={selectedView}
            search={explorerState.search}
            selectedArticleIds={selectedArticleIds}
            selectedFolderIds={selectedFolderIds}
            onUploadRequested={() =>
              handleUpload("files")
            }
            onArticleSelectedChange={
              toggleArticleSelection
            }
            onFolderSelectedChange={
              toggleFolderSelection
            }
          />
        </div>

        <AppPagination
          page={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
      </AppCard>

      <CreateFolderDialog
        open={isCreateFolderOpen}
        parentLibraryId={currentFolderId}
        onClose={() => {
          setIsCreateFolderOpen(false);
        }}
      />

      {currentFolderId ? (
        <KnowledgeImportModal
          open={isKnowledgeImportOpen}
          context={{
            origin: selectedLibraryId
              ? "folder"
              : "root",
            libraryId: currentFolderId,
          }}
          selectedFiles={selectedFiles}
          onOpenChange={setIsKnowledgeImportOpen}
        />
      ) : null}

      <input
        ref={filesInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFilesSelected}
      />

      <input
        ref={folderInputRef}
        type="file"
        // @ts-expect-error webkitdirectory
        webkitdirectory=""
        multiple
        className="hidden"
        onChange={handleFilesSelected}
      />

      <input
        ref={zipInputRef}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={handleFilesSelected}
      />
    </>
  );
}