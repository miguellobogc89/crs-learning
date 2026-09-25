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
    return <ArrowDownAZ className="h-4 w-4" />;
  }

  if (sort === "name_desc") {
    return <ArrowDownZA className="h-4 w-4" />;
  }

  return <ListFilter className="h-4 w-4" />;
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
    "inline-flex h-10 items-center gap-2 rounded-xl border-0 bg-white px-3.5 text-sm font-medium text-slate-700 shadow-none outline-none transition-colors duration-150 hover:bg-slate-50 hover:text-slate-950 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0";

  const selectionButtonClassName =
    "inline-flex h-10 w-10 items-center justify-center rounded-xl border-0 bg-white text-slate-600 shadow-none outline-none transition-colors duration-150 hover:bg-slate-50 hover:text-slate-950 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0";

  return (
    <div className="flex flex-col gap-3 py-3 lg:flex-row lg:items-center">
      <SearchInput
        className="min-w-0 flex-1"
        placeholder={`Buscar en ${title}...`}
        value={explorerState.search}
        onChange={(value) => {
          updateExplorerState({
            search: value,
          });
        }}
      />

      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={toolbarButtonClassName}
            >
              <Filter
                className="h-4 w-4"
                strokeWidth={2.25}
              />

              <span>Filtrar</span>

              {activeFilterCount > 0 ? (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-900 px-1.5 text-[11px] font-semibold text-white">
                  {activeFilterCount}
                </span>
              ) : null}

              <ChevronDown className="h-4 w-4 text-slate-400" />
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
                  className="text-xs font-medium text-slate-700 transition-colors hover:text-slate-950 hover:underline"
                >
                  Limpiar
                </button>
              ) : null}
            </div>

            <DropdownMenuSeparator />

            <DropdownMenuLabel className="text-xs text-muted-foreground">
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
                <ListFilter className="mr-2 h-4 w-4" />
                Todo el contenido
              </DropdownMenuRadioItem>

              <DropdownMenuRadioItem value="folders">
                <Folder className="mr-2 h-4 w-4" />
                Solo carpetas
              </DropdownMenuRadioItem>

              <DropdownMenuRadioItem value="articles">
                <FileText className="mr-2 h-4 w-4" />
                Solo artículos
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>

            <DropdownMenuSeparator />

            <DropdownMenuLabel className="text-xs text-muted-foreground">
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
                <Check className="mr-2 h-4 w-4" />
                Todos los estados
              </DropdownMenuRadioItem>

              <DropdownMenuRadioItem value="ready">
                <Sparkles className="mr-2 h-4 w-4" />
                IA procesada
              </DropdownMenuRadioItem>

              <DropdownMenuRadioItem value="processing">
                <LoaderCircle className="mr-2 h-4 w-4" />
                Procesando
              </DropdownMenuRadioItem>

              <DropdownMenuRadioItem value="draft">
                <CircleDashed className="mr-2 h-4 w-4" />
                Borrador
              </DropdownMenuRadioItem>

              <DropdownMenuRadioItem value="error">
                <CircleAlert className="mr-2 h-4 w-4" />
                Error
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={`${toolbarButtonClassName} min-w-40 justify-between`}
            >
              <span className="flex items-center gap-2">
                {getSortIcon(explorerState.sort)}
                {sortLabels[explorerState.sort]}
              </span>

              <ChevronDown className="h-4 w-4 text-slate-400" />
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

        <div className="ml-1 flex h-10 items-center rounded-xl border-0 bg-white p-1 shadow-none">
          <button
            type="button"
            onClick={() => {
              updateExplorerState({
                viewMode: "grid",
              });
            }}
            className={[
              "inline-flex h-8 w-8 items-center justify-center rounded-lg border-0 shadow-none outline-none transition-colors duration-150",
              "focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0",
              explorerState.viewMode === "grid"
                ? "bg-slate-100 text-slate-950"
                : "bg-white text-slate-400 hover:bg-slate-50 hover:text-slate-700",
            ].join(" ")}
            title="Vista de tarjetas"
            aria-label="Vista de tarjetas"
          >
            <Grid2X2
              className="h-4 w-4"
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
              "inline-flex h-8 w-8 items-center justify-center rounded-lg border-0 shadow-none outline-none transition-colors duration-150",
              "focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0",
              explorerState.viewMode === "list"
                ? "bg-slate-100 text-slate-950"
                : "bg-white text-slate-400 hover:bg-slate-50 hover:text-slate-700",
            ].join(" ")}
            title="Vista de lista"
            aria-label="Vista de lista"
          >
            <List
              className="h-4 w-4"
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
              <FolderInput className="h-4 w-4" />
            </button>

            <button
              type="button"
              className={selectionButtonClassName}
              onClick={onShareSelection}
              title="Compartir selección"
              aria-label="Compartir selección"
            >
              <Share2 className="h-4 w-4" />
            </button>

            <button
              type="button"
              className={selectionButtonClassName}
              onClick={onDeleteSelection}
              title="Eliminar selección"
              aria-label="Eliminar selección"
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </button>

            <button
              type="button"
              className={selectionButtonClassName}
              onClick={onClearSelection}
              title="Limpiar selección"
              aria-label="Limpiar selección"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}