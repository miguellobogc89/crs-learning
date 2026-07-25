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
  Grid2X2,
  List,
  ListFilter,
  LoaderCircle,
  Sparkles,
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
              className={[
                "inline-flex h-10 items-center gap-2 rounded-xl border px-3.5 text-sm font-medium outline-none transition",
                "focus-visible:ring-4 focus-visible:ring-primary/10",
                activeFilterCount > 0
                  ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
                  : "border-border bg-background text-foreground hover:bg-muted",
              ].join(" ")}
            >
              <Filter className="h-4 w-4" strokeWidth={2.25} />

              Filtrar

              {activeFilterCount > 0 ? (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                  {activeFilterCount}
                </span>
              ) : null}

              <ChevronDown className="h-4 w-4 text-muted-foreground" />
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
                  className="text-xs font-medium text-primary hover:underline"
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
              className="inline-flex h-10 min-w-40 items-center justify-between gap-2 rounded-xl border border-border bg-background px-3.5 text-sm font-medium text-foreground outline-none transition hover:bg-muted focus-visible:ring-4 focus-visible:ring-primary/10"
            >
              <span className="flex items-center gap-2">
                {getSortIcon(explorerState.sort)}
                {sortLabels[explorerState.sort]}
              </span>

              <ChevronDown className="h-4 w-4 text-muted-foreground" />
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

        <div className="ml-1 flex h-10 items-center rounded-xl border border-border bg-background p-1">
          <button
            type="button"
            onClick={() => {
              updateExplorerState({
                viewMode: "grid",
              });
            }}
            className={[
              "inline-flex h-8 w-8 items-center justify-center rounded-lg transition",
              explorerState.viewMode === "grid"
                ? "bg-muted text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
            ].join(" ")}
            title="Vista de tarjetas"
            aria-label="Vista de tarjetas"
          >
            <Grid2X2 className="h-4 w-4" strokeWidth={2.25} />
          </button>

          <button
            type="button"
            onClick={() => {
              updateExplorerState({
                viewMode: "list",
              });
            }}
            className={[
              "inline-flex h-8 w-8 items-center justify-center rounded-lg transition",
              explorerState.viewMode === "list"
                ? "bg-muted text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
            ].join(" ")}
            title="Vista de lista"
            aria-label="Vista de lista"
          >
            <List className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </div>
      </div>
    </div>
  );
}