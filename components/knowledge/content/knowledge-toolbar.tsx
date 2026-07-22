"use client";

import type { ReactNode } from "react";
import {
  ArrowDownUp,
  ChevronDown,
  Filter,
  FolderPlus,
  Grid2X2,
  List,
  Upload,
} from "lucide-react";
// components/knowledge/content/knowledge-toolbar.tsx

// components/knowledge/content/knowledge-toolbar.tsx

import {
  Archive,
  FileUp,
  FolderUp,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { SearchInput } from "@/components/ui/search-input";

type ExplorerState = {
  search: string;
  viewMode: "grid" | "list";
  sort:
    | "updated_desc"
    | "updated_asc"
    | "name_asc"
    | "name_desc"
    | "status";
};

type Props = {
  explorerState: ExplorerState;
  onExplorerStateChange: (state: ExplorerState) => void;
  selectedLibraryId: string | null;
  title: string;
  breadcrumb: ReactNode;
  onCreateFolder: () => void;

  onUpload: (type: "files" | "folder" | "zip") => void;
};

const sortLabels: Record<ExplorerState["sort"], string> = {
  updated_desc: "Más recientes",
  updated_asc: "Más antiguos",
  name_asc: "Nombre A-Z",
  name_desc: "Nombre Z-A",
  status: "Estado",
};

export function KnowledgeToolbar({
  explorerState,
  onExplorerStateChange,
  title,
  breadcrumb,
  onCreateFolder,
  onUpload,
}: Props) {
  function updateExplorerState(value: Partial<ExplorerState>) {
    onExplorerStateChange({
      ...explorerState,
      ...value,
    });
  }

  return (
    <header className="mb-6 border-b border-border">
      <div className="flex items-center gap-3 pb-6">
        <SearchInput
          className="min-w-0 max-w-none flex-1"
          placeholder={`Buscar en ${title}...`}
          value={explorerState.search}
          onChange={(value) => updateExplorerState({ search: value })}
        />
      </div>

      <div className="mb-2 min-h-7">{breadcrumb}</div>

      <div className="flex flex-col gap-4 pb-6 lg:flex-row lg:items-center lg:justify-between">
        <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>

        <div className="flex flex-wrap items-center gap-2">

<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <button
      type="button"
      className="inline-flex h-10 items-center gap-2 rounded-xl bg-muted px-3.5 text-sm font-medium text-foreground transition hover:bg-muted/80"
    >
      <Upload className="h-4 w-4" />
      Subir
      <ChevronDown className="h-4 w-4 text-muted-foreground" />
    </button>
  </DropdownMenuTrigger>

  <DropdownMenuContent
    align="end"
    className="w-64"
  >
    <DropdownMenuLabel>
      Añadir documentación
    </DropdownMenuLabel>

    <DropdownMenuSeparator />

    <DropdownMenuItem
      className="gap-3 py-2.5"
      onSelect={() => onUpload("files")}
    >
      <FileUp className="h-4 w-4" />

      <div>
        <p className="font-medium">
          Subir archivos
        </p>

        <p className="text-xs text-muted-foreground">
          Selecciona uno o varios documentos
        </p>
      </div>
    </DropdownMenuItem>

    <DropdownMenuItem
      className="gap-3 py-2.5"
      onSelect={() => onUpload("folder")}
    >
      <FolderUp className="h-4 w-4" />

      <div>
        <p className="font-medium">
          Subir carpeta
        </p>

        <p className="text-xs text-muted-foreground">
          Conserva su estructura interna
        </p>
      </div>
    </DropdownMenuItem>

    <DropdownMenuItem
      className="gap-3 py-2.5"
      onSelect={() => onUpload("zip")}
    >
      <Archive className="h-4 w-4" />

      <div>
        <p className="font-medium">
          Subir archivo comprimido
        </p>

        <p className="text-xs text-muted-foreground">
          Archivo ZIP con documentos y carpetas
        </p>
      </div>
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>

          <button
            type="button"
            onClick={onCreateFolder}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-surface px-3 text-sm font-medium text-foreground transition hover:bg-surface-hover"
          >
            <FolderPlus className="h-4 w-4" strokeWidth={2.25} />
            Nueva carpeta
          </button>
        </div>
      </div>

      <div className="flex min-h-14 flex-col gap-3 py-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-full bg-surface px-3 text-sm font-medium text-foreground transition hover:bg-surface-hover"
          >
            <Filter className="h-4 w-4" strokeWidth={2.25} />
            Filtrar
          </button>

          <div className="relative">
            <select
              className="h-9 appearance-none rounded-full border border-transparent bg-surface py-0 pl-4 pr-9 text-sm font-medium text-foreground outline-none transition hover:bg-surface-hover"
              value={explorerState.sort}
              onChange={(event) => {
                updateExplorerState({
                  sort: event.target.value as ExplorerState["sort"],
                });
              }}
              aria-label="Ordenar documentos"
            >
              {Object.entries(sortLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>

            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>

          <ArrowDownUp
            className="h-4 w-4 text-muted-foreground"
            strokeWidth={2.25}
          />
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => updateExplorerState({ viewMode: "grid" })}
            className={[
              "inline-flex h-9 w-9 items-center justify-center rounded-lg transition hover:bg-surface",
              explorerState.viewMode === "grid"
                ? "bg-surface text-foreground"
                : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
            title="Vista de tarjetas"
            aria-label="Vista de tarjetas"
          >
            <Grid2X2 className="h-4 w-4" strokeWidth={2.25} />
          </button>

          <button
            type="button"
            onClick={() => updateExplorerState({ viewMode: "list" })}
            className={[
              "inline-flex h-9 w-9 items-center justify-center rounded-lg transition hover:bg-surface",
              explorerState.viewMode === "list"
                ? "bg-surface text-foreground"
                : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
            title="Vista de lista"
            aria-label="Vista de lista"
          >
            <List className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </div>
      </div>
    </header>
  );
}
