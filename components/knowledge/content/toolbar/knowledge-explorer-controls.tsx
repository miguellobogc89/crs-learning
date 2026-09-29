// components/knowledge/content/toolbar/knowledge-explorer-controls.tsx

"use client";

import {
  ArrowDownAZ,
  ArrowDownZA,
  Check,
  ChevronDown,
  CircleAlert,
  CircleDashed,
  FileText,
  Filter,
  Folder,
  FolderInput,
  Grid2X2,
  List,
  ListFilter,
  LoaderCircle,
  Share2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import { SearchInput } from "@/components/ui/search-input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type {
  ExplorerItemType,
  ExplorerSort,
  ExplorerState,
  ExplorerStatus,
} from "./types";

type Props = {
  title: string;
  explorerState: ExplorerState;
  onExplorerStateChange: (state: ExplorerState) => void;
  selectedCount?: number;
  onMoveSelection?: () => void;
  onShareSelection?: () => void;
  onDeleteSelection?: () => void;
  onClearSelection?: () => void;
};

const sortLabels: Record<ExplorerSort, string> = {
  updated_desc: "Más recientes",
  updated_asc: "Más antiguos",
  name_asc: "Nombre A-Z",
  name_desc: "Nombre Z-A",
  status: "Estado",
};

function getSortIcon(sort: ExplorerSort) {
  if (sort === "name_asc") {
    return <ArrowDownAZ className="size-icon-md" />;
  }

  if (sort === "name_desc") {
    return <ArrowDownZA className="size-icon-md" />;
  }

  return <ListFilter className="size-icon-md" />;
}

export function KnowledgeExplorerControls({
  title,
  explorerState,
  onExplorerStateChange,
  selectedCount = 0,
  onMoveSelection,
  onShareSelection,
  onDeleteSelection,
  onClearSelection,
}: Props) {
  function updateExplorerState(
    value: Partial<ExplorerState>,
  ) {
    onExplorerStateChange({
      ...explorerState,
      ...value,
    });
  }

  const activeFilterCount = [
    explorerState.itemType !== "all",
    explorerState.status !== "all",
  ].filter(Boolean).length;

  function resetFilters() {
    updateExplorerState({
      itemType: "all",
      status: "all",
    });
  }

  const toolbarButtonClassName =
    "inline-flex h-control-lg items-center gap-2 rounded-xl border-0 bg-white px-3.5 text-body font-medium text-slate-700 shadow-none outline-none transition-colors duration-150 hover:bg-slate-50 hover:text-slate-950 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0";

  const selectionButtonClassName =
    "inline-flex size-control-lg items-center justify-center rounded-xl border-0 bg-white text-slate-600 shadow-none outline-none transition-colors duration-150 hover:bg-slate-50 hover:text-slate-950 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0";

  return (
    <div className="knowledge-explorer-controls">
      <SearchInput
        className="knowledge-explorer-controls__search min-w-0"
        placeholder={`Buscar en ${title}...`}
        value={explorerState.search}
        onChange={(value) => {
          updateExplorerState({
            search: value,
          });
        }}
      />

      <div className="knowledge-explorer-controls__actions">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={`${toolbarButtonClassName} knowledge-filter-trigger`}
              title="Filtrar"
              aria-label="Filtrar"
            >
              <Filter
                className="size-icon-md"
                strokeWidth={2.25}
              />

              <span className="knowledge-toolbar-label">
                Filtrar
              </span>

              {activeFilterCount > 0 ? (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-900 px-1.5 text-[11px] font-semibold text-white">
                  {activeFilterCount}
                </span>
              ) : null}

              <ChevronDown className="knowledge-toolbar-chevron size-icon-md text-slate-400" />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="end"
            className="w-64"
          >
            <div className="flex items-center justify-between px-2 py-1.5">
              <DropdownMenuLabel className="p-0">
                Filtros
              </DropdownMenuLabel>

              {activeFilterCount > 0 ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    resetFilters();
                  }}
                  className="text-caption font-medium text-slate-700 transition-colors hover:text-slate-950 hover:underline"
                >
                  Limpiar
                </button>
              ) : null}
            </div>

            <DropdownMenuSeparator />

            <DropdownMenuLabel className="text-caption text-muted-foreground">
              Tipo de contenido
            </DropdownMenuLabel>

            <DropdownMenuRadioGroup
              value={explorerState.itemType}
              onValueChange={(value) => {
                updateExplorerState({
                  itemType: value as ExplorerItemType,
                });
              }}
            >
              <DropdownMenuRadioItem value="all">
                <ListFilter className="mr-2 size-icon-md" />
                Todo el contenido
              </DropdownMenuRadioItem>

              <DropdownMenuRadioItem value="folders">
                <Folder className="mr-2 size-icon-md" />
                Solo carpetas
              </DropdownMenuRadioItem>

              <DropdownMenuRadioItem value="articles">
                <FileText className="mr-2 size-icon-md" />
                Solo artículos
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>

            <DropdownMenuSeparator />

            <DropdownMenuLabel className="text-caption text-muted-foreground">
              Estado del artículo
            </DropdownMenuLabel>

            <DropdownMenuRadioGroup
              value={explorerState.status}
              onValueChange={(value) => {
                updateExplorerState({
                  status: value as ExplorerStatus,
                });
              }}
            >
              <DropdownMenuRadioItem value="all">
                <Check className="mr-2 size-icon-md" />
                Todos los estados
              </DropdownMenuRadioItem>

              <DropdownMenuRadioItem value="ready">
                <Sparkles className="mr-2 size-icon-md" />
                IA procesada
              </DropdownMenuRadioItem>

              <DropdownMenuRadioItem value="processing">
                <LoaderCircle className="mr-2 size-icon-md" />
                Procesando
              </DropdownMenuRadioItem>

              <DropdownMenuRadioItem value="draft">
                <CircleDashed className="mr-2 size-icon-md" />
                Borrador
              </DropdownMenuRadioItem>

              <DropdownMenuRadioItem value="error">
                <CircleAlert className="mr-2 size-icon-md" />
                Error
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={`${toolbarButtonClassName} knowledge-sort-trigger min-w-40 max-w-full justify-between`}
              title={`Ordenar por ${sortLabels[explorerState.sort]}`}
              aria-label={`Ordenar por ${sortLabels[explorerState.sort]}`}
            >
              <span className="flex min-w-0 items-center gap-2">
                {getSortIcon(explorerState.sort)}

                <span className="knowledge-toolbar-label truncate">
                  {sortLabels[explorerState.sort]}
                </span>
              </span>

              <ChevronDown className="knowledge-toolbar-chevron size-icon-md text-slate-400" />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="end"
            className="w-56"
          >
            <DropdownMenuLabel>
              Ordenar por
            </DropdownMenuLabel>

            <DropdownMenuSeparator />

            <DropdownMenuRadioGroup
              value={explorerState.sort}
              onValueChange={(value) => {
                updateExplorerState({
                  sort: value as ExplorerSort,
                });
              }}
            >
              <DropdownMenuRadioItem value="updated_desc">
                Más recientes
              </DropdownMenuRadioItem>

              <DropdownMenuRadioItem value="updated_asc">
                Más antiguos
              </DropdownMenuRadioItem>

              <DropdownMenuRadioItem value="name_asc">
                Nombre A-Z
              </DropdownMenuRadioItem>

              <DropdownMenuRadioItem value="name_desc">
                Nombre Z-A
              </DropdownMenuRadioItem>

              <DropdownMenuRadioItem value="status">
                Estado
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="knowledge-view-toggle ml-1 flex h-control-lg items-center rounded-xl border-0 bg-white p-1 shadow-none">
          <button
            type="button"
            onClick={() => {
              updateExplorerState({
                viewMode: "grid",
              });
            }}
            className={[
              "inline-flex size-control-md items-center justify-center rounded-lg border-0 shadow-none outline-none transition-colors duration-150",
              "focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0",
              explorerState.viewMode === "grid"
                ? "bg-slate-100 text-slate-950"
                : "bg-white text-slate-400 hover:bg-slate-50 hover:text-slate-700",
            ].join(" ")}
            title="Vista de tarjetas"
            aria-label="Vista de tarjetas"
          >
            <Grid2X2
              className="size-icon-md"
              strokeWidth={2.25}
            />
          </button>

          <button
            type="button"
            onClick={() => {
              updateExplorerState({
                viewMode: "list",
              });
            }}
            className={[
              "inline-flex size-control-md items-center justify-center rounded-lg border-0 shadow-none outline-none transition-colors duration-150",
              "focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0",
              explorerState.viewMode === "list"
                ? "bg-slate-100 text-slate-950"
                : "bg-white text-slate-400 hover:bg-slate-50 hover:text-slate-700",
            ].join(" ")}
            title="Vista de lista"
            aria-label="Vista de lista"
          >
            <List
              className="size-icon-md"
              strokeWidth={2.25}
            />
          </button>
        </div>

        {selectedCount > 0 ? (
          <>
            <div className="mx-1 h-6 w-px bg-slate-200" />

            <button
              type="button"
              className={selectionButtonClassName}
              onClick={onMoveSelection}
              title="Mover selección"
              aria-label="Mover selección"
            >
              <FolderInput className="size-icon-md" />
            </button>

            <button
              type="button"
              className={selectionButtonClassName}
              onClick={onShareSelection}
              title="Compartir selección"
              aria-label="Compartir selección"
            >
              <Share2 className="size-icon-md" />
            </button>

            <button
              type="button"
              className={selectionButtonClassName}
              onClick={onDeleteSelection}
              title="Eliminar selección"
              aria-label="Eliminar selección"
            >
              <Trash2 className="size-icon-md text-destructive" />
            </button>

            <button
              type="button"
              className={selectionButtonClassName}
              onClick={onClearSelection}
              title="Limpiar selección"
              aria-label="Limpiar selección"
            >
              <X className="size-icon-md" />
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
