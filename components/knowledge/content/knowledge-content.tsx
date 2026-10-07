// components/knowledge/content/knowledge-content.tsx

"use client";

import {
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { AppCard } from "@/components/app/layouts/app-card";
import { AppPageLayout } from "@/components/app/layouts/app-page-layout";
import { AppPagination } from "@/components/app/layouts/app-pagination";
import { KnowledgeImportModal } from "@/components/knowledge/import/modal";
import {
  buildLibraryTree,
  getLibraryPath,
} from "@/components/knowledge/sidebar/tree-utils";
import { APP_SECTIONS } from "@/lib/navigation/app-sections";

import { CreateFolderDialog } from "./create-folder-dialog";
import { KnowledgeExplorer } from "./knowledge-explorer";
import { AppPageHeader } from "@/components/app/layouts/app-page-header";
import { KnowledgeActions } from "./toolbar/knowledge-actions";
import { KnowledgeToolbar } from "./toolbar/knowledge-toolbar";
import type { ExplorerState } from "./toolbar/types";
import {
  KNOWLEDGE_PAGE_SIZE,
  type KnowledgeLibrary,
  type KnowledgeSource,
  useKnowledgeExplorer,
} from "./use-knowledge-explorer";
import { useKnowledgeSelection } from "./use-knowledge-selection";
import { useKnowledgeUpload } from "./use-knowledge-upload";

type Props = {
  knowledgeSources: KnowledgeSource[];
  knowledgeLibraries: KnowledgeLibrary[];
  selectedLibraryId: string | null;
  selectedView: string;
  aside?: ReactNode;
};

export function KnowledgeContent({
  knowledgeSources,
  knowledgeLibraries,
  selectedLibraryId,
  selectedView,
  aside,
}: Props) {
  const [
    explorerState,
    setExplorerState,
  ] = useState<ExplorerState>({
    search: "",
    viewMode: "grid",
    sort: "updated_desc",
    itemType: "all",
    status: "all",
  });

  const [page, setPage] =
    useState(1);

  const [
    isCreateFolderOpen,
    setIsCreateFolderOpen,
  ] = useState(false);

  const {
    selectedArticleIds,
    selectedFolderIds,
    selectedCount,
    toggleArticleSelection,
    toggleFolderSelection,
    clearSelection,
  } = useKnowledgeSelection();

  const {
    isKnowledgeImportOpen,
    setIsKnowledgeImportOpen,
    selectedFiles,
    filesInputRef,
    folderInputRef,
    zipInputRef,
    handleFilesSelected,
    handleDroppedFiles,
    handleUpload,
  } = useKnowledgeUpload();

  const selectedLibrary =
    useMemo(() => {
      return knowledgeLibraries.find(
        (library) =>
          library.id ===
          selectedLibraryId,
      );
    }, [
      knowledgeLibraries,
      selectedLibraryId,
    ]);

  const currentFolderId =
    useMemo(() => {
      if (selectedLibraryId) {
        return selectedLibraryId;
      }

      const rootLibraries =
        knowledgeLibraries.filter(
          (library) =>
            library.parent_id ===
              null &&
            library.name ===
              "Mi biblioteca" &&
            !library.is_shared,
        );

      return rootLibraries.length ===
        1
        ? rootLibraries[0].id
        : null;
    }, [
      knowledgeLibraries,
      selectedLibraryId,
    ]);

  const {
    visibleItems,
    totalItems,
    totalPages,
    currentPage,
  } = useKnowledgeExplorer({
    knowledgeSources,
    knowledgeLibraries,
    currentFolderId,
    selectedView,
    explorerState,
    page,
  });

  const libraryTree =
    useMemo(() => {
      return buildLibraryTree(
        knowledgeLibraries,
      );
    }, [knowledgeLibraries]);

  const libraryPath =
    useMemo(() => {
      return getLibraryPath(
        libraryTree,
        selectedLibraryId,
      );
    }, [
      libraryTree,
      selectedLibraryId,
    ]);

  const currentLibrary =
    libraryPath[
      libraryPath.length - 1
    ];

  let pageTitle =
    "Conocimiento";

  if (
    selectedView === "all" &&
    !selectedLibraryId
  ) {
    pageTitle = "Todo";
  } else if (
    selectedView === "shared"
  ) {
    pageTitle =
      "Compartido conmigo";
  } else if (
    selectedView === "public"
  ) {
    pageTitle = "Públicos";
  } else if (
    selectedView === "private"
  ) {
    pageTitle = "Privados";
  } else if (
    selectedView === "favorites"
  ) {
    pageTitle = "Favoritos";
  } else if (
    selectedView === "recent"
  ) {
    pageTitle = "Recientes";
  } else if (currentLibrary) {
    pageTitle =
      currentLibrary.name;
  }

  let parentHref:
    | string
    | null = null;

  if (selectedView !== "all") {
    parentHref = "/knowledge";
  } else if (selectedLibrary) {
    if (
      selectedLibrary.parent_id
    ) {
      parentHref =
        `/knowledge?library=${encodeURIComponent(
          selectedLibrary.parent_id,
        )}`;
    } else {
      parentHref =
        "/knowledge";
    }
  }

const breadcrumbItems =
  selectedLibraryId &&
  libraryPath.length > 0
    ? libraryPath.map(
        (library, index) => ({
          label: library.name,
          href:
            index <
            libraryPath.length - 1
              ? `/knowledge?library=${encodeURIComponent(
                  library.id,
                )}`
              : undefined,
        }),
      )
    : [];

  function handleCreateFolder() {
    if (!currentFolderId) {
      window.alert(
        "No se ha encontrado la carpeta «Mi biblioteca». Recarga la página antes de crear una carpeta.",
      );

      return;
    }

    setIsCreateFolderOpen(true);
  }

  return (
<AppPageLayout
  aside={aside}
  header={
    <AppPageHeader
      section={APP_SECTIONS.knowledge}
      title={pageTitle}
      items={breadcrumbItems}
      actions={
        <KnowledgeActions
          onCreateFolder={handleCreateFolder}
          onUpload={handleUpload}
        />
      }
    />
  }
  contentClassName="!flex !flex-col !overflow-hidden !px-0 !pb-0"
>
      <>
        <AppCard className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-none border-0 p-0 shadow-none">
          <div className="z-10 shrink-0 px-5 py-3 sm:px-6">
            <KnowledgeToolbar
              explorerState={
                explorerState
              }
              onExplorerStateChange={(
                nextState,
              ) => {
                setExplorerState(
                  nextState,
                );

                setPage(1);
              }}
              title={pageTitle}
              selectedCount={
                selectedCount
              }
              onClearSelection={
                clearSelection
              }
            />
          </div>

          <div className="min-h-0 min-w-0 flex-1 overflow-hidden px-5 pb-5 sm:px-6 sm:pb-6">
            <div
              key={
                explorerState.viewMode ===
                "grid"
                  ? currentPage
                  : "list"
              }
              className={
                explorerState.viewMode ===
                "grid"
                  ? "h-full min-h-0 animate-[knowledge-page-in_180ms_ease-out]"
                  : "h-full min-h-0"
              }
            >
              <KnowledgeExplorer
                folders={
                  visibleItems.folders
                }
                knowledgeSources={
                  visibleItems.knowledgeSources
                }
                viewMode={
                  explorerState.viewMode
                }
                selectedLibraryId={
                  selectedLibraryId
                }
                selectedView={
                  selectedView
                }
                search={
                  explorerState.search
                }
                selectedArticleIds={
                  selectedArticleIds
                }
                selectedFolderIds={
                  selectedFolderIds
                }
                onUploadRequested={() =>
                  handleUpload(
                    "files",
                  )
                }
                onArticleSelectedChange={
                  toggleArticleSelection
                }
                onFolderSelectedChange={
                  toggleFolderSelection
                }
                onUploadFolderRequested={() =>
                  handleUpload(
                    "folder",
                  )
                }
                onCreateFolderRequested={
                  handleCreateFolder
                }
                onFilesDropped={
                  handleDroppedFiles
                }
              />
            </div>
          </div>

          {explorerState.viewMode ===
          "grid" ? (
            <div className="shrink-0 border-t border-slate-100">
              <AppPagination
                page={
                  currentPage
                }
                totalPages={
                  totalPages
                }
                totalItems={
                  totalItems
                }
                pageSize={
                  KNOWLEDGE_PAGE_SIZE
                }
                onPageChange={
                  setPage
                }
              />
            </div>
          ) : null}
        </AppCard>

        <CreateFolderDialog
          open={
            isCreateFolderOpen
          }
          parentLibraryId={
            currentFolderId
          }
          onClose={() => {
            setIsCreateFolderOpen(
              false,
            );
          }}
        />

        {currentFolderId ? (
          <KnowledgeImportModal
            open={
              isKnowledgeImportOpen
            }
            context={{
              origin:
                selectedLibraryId
                  ? "folder"
                  : "root",
              libraryId:
                currentFolderId,
            }}
            selectedFiles={
              selectedFiles
            }
            onOpenChange={
              setIsKnowledgeImportOpen
            }
          />
        ) : null}

        <input
          ref={filesInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={
            handleFilesSelected
          }
        />

        <input
          ref={folderInputRef}
          type="file"
          // @ts-expect-error webkitdirectory
          webkitdirectory=""
          multiple
          className="hidden"
          onChange={
            handleFilesSelected
          }
        />

        <input
          ref={zipInputRef}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={
            handleFilesSelected
          }
        />
      </>
    </AppPageLayout>
  );
}