// components/knowledge/content/knowledge-toolbar.tsx
import Link from "next/link";
import {
  ArrowDownUp,
  Filter,
  FolderPlus,
  Grid2X2,
  List,
  Plus,
} from "lucide-react";

import { SearchInput } from "@/components/ui/search-input";

type ExplorerState = {
  search: string;
  viewMode: "grid" | "list";
  sort: "updated_desc" | "updated_asc" | "name_asc" | "name_desc" | "status";
};

type Props = {
  explorerState: ExplorerState;
  onExplorerStateChange: (state: ExplorerState) => void;
  selectedLibraryId: string | null;
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
  selectedLibraryId,
}: Props) {
  function updateExplorerState(value: Partial<ExplorerState>) {
    onExplorerStateChange({
      ...explorerState,
      ...value,
    });
  }

  return (
    <div className="mb-4 border-b border-border bg-background">
      <div className="flex min-h-14 flex-col gap-3 py-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <SearchInput
            className="max-w-md flex-1"
            placeholder="Buscar en esta carpeta..."
            value={explorerState.search}
            onChange={(value) => updateExplorerState({ search: value })}
          />

          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-medium text-foreground hover:bg-surface"
          >
            <Filter className="h-5 w-5" strokeWidth={2.25} />
            Filtrar
          </button>

          <select
            className="h-10 rounded-md border border-transparent bg-background px-3 text-sm font-medium text-foreground hover:bg-surface"
            value={explorerState.sort}
            onChange={(event) =>
              updateExplorerState({
                sort: event.target.value as ExplorerState["sort"],
              })
            }
            aria-label="Ordenar"
          >
            {Object.entries(sortLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <ArrowDownUp className="h-5 w-5 text-muted-foreground" strokeWidth={2.25} />
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => updateExplorerState({ viewMode: "grid" })}
            className={`inline-flex h-10 w-10 items-center justify-center rounded-md hover:bg-surface ${
              explorerState.viewMode === "grid"
                ? "bg-surface text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title="Vista tarjetas"
          >
            <Grid2X2 className="h-5 w-5" strokeWidth={2.25} />
          </button>

          <button
            type="button"
            onClick={() => updateExplorerState({ viewMode: "list" })}
            className={`inline-flex h-10 w-10 items-center justify-center rounded-md hover:bg-surface ${
              explorerState.viewMode === "list"
                ? "bg-surface text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title="Vista lista"
          >
            <List className="h-5 w-5" strokeWidth={2.25} />
          </button>

          <div className="mx-2 h-6 w-px bg-border" />

          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-medium text-foreground hover:bg-surface"
          >
            <FolderPlus className="h-5 w-5" strokeWidth={2.25} />
            Carpeta
          </button>

          {selectedLibraryId && (
            <Link
              href={`/knowledge/new?library=${selectedLibraryId}`}
              className="ml-2 inline-flex h-10 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-5 w-5" strokeWidth={2.25} />
              Nuevo
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}