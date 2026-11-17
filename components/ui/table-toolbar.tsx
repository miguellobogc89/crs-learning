"use client";
// components/ui/table-toolbar.tsx
// Cabecera estándar de las tablas (nació en Oportunidades de Trading): buscador, «Filtrar» con grupos y
// contador, «Ordenar» con el orden activo, «Agrupar» opcional y cambio de vista. Cada tabla le pasa solo sus
// opciones; el aspecto es siempre el mismo. `extra` va a la izquierda de los botones (p. ej. el periodo).
import type { ComponentType, ReactNode } from "react";
import { ArrowDownAZ, ArrowDownZA, Check, ChevronDown, Filter, Grid2X2, Layers, List, ListFilter } from "lucide-react";
import { SearchInput } from "@/components/ui/search-input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type ToolbarSort = { key: string; dir: 1 | -1 } | null;
export type ToolbarViewMode = "list" | "grid";

/** Botón de la cabecera (también para controles propios que van en `extra`). */
export const toolbarButton =
  "inline-flex h-control-lg items-center gap-2 rounded-xl border-0 bg-white px-3.5 text-body font-medium text-slate-700 shadow-none outline-none transition-colors duration-150 hover:bg-slate-50 hover:text-slate-950 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0";
const viewStyle =
  "inline-flex size-control-md items-center justify-center rounded-lg border-0 shadow-none outline-none transition-colors duration-150 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0";

export type FilterGroup = {
  key: string;
  label: string;
  /** Valor elegido; `"all"` = sin filtro. */
  value: string;
  allLabel: string;
  allIcon?: ComponentType<{ className?: string }>;
  options: { value: string; label: string }[];
};

export type TableToolbarProps = {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filters?: { groups: FilterGroup[]; onChange: (key: string, value: string) => void; onClear: () => void };
  sort?: {
    value: ToolbarSort;
    options: { label: string; value: NonNullable<ToolbarSort> }[];
    onChange: (value: ToolbarSort) => void;
    /** Nombre de una columna, para cuando el orden viene de pulsar la cabecera de la tabla. */
    columnLabels?: Record<string, string>;
    /** Columnas de texto: el icono pasa a A-Z / Z-A. */
    textKeys?: string[];
  };
  group?: { value: string; options: { value: string; label: string }[]; onChange: (value: string) => void };
  view?: { value: ToolbarViewMode; onChange: (value: ToolbarViewMode) => void };
  extra?: ReactNode;
};

export function TableToolbar({ search, onSearchChange, searchPlaceholder = "Buscar...", filters, sort, group, view, extra }: TableToolbarProps) {
  const count = filters ? filters.groups.filter((g) => g.value !== "all").length : 0;
  const current = sort?.options.find((o) => o.value.key === sort.value?.key && o.value.dir === sort.value?.dir);
  const sortLabel = !sort
    ? ""
    : current?.label ?? (sort.value ? (sort.columnLabels?.[sort.value.key] ?? sort.value.key) + (sort.value.dir === 1 ? " ↑" : " ↓") : "Ordenar");
  const SortIcon = sort?.value && sort.textKeys?.includes(sort.value.key) ? (sort.value.dir === 1 ? ArrowDownAZ : ArrowDownZA) : ListFilter;
  const groupLabel = group?.options.find((o) => o.value === group.value)?.label ?? "Sin agrupar";

  return (
    <div className="knowledge-toolbar-container shrink-0">
      <div className="knowledge-explorer-controls">
        <SearchInput className="knowledge-explorer-controls__search min-w-0" placeholder={searchPlaceholder} value={search} onChange={onSearchChange} />
        <div className="knowledge-explorer-controls__actions">
          {extra}
          {filters && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className={toolbarButton + " knowledge-filter-trigger"} title="Filtrar" aria-label="Filtrar">
                  <Filter className="size-icon-md" strokeWidth={2.25} />
                  <span className="knowledge-toolbar-label">Filtrar</span>
                  {count > 0 && (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-900 px-1.5 text-[11px] font-semibold text-white">{count}</span>
                  )}
                  <ChevronDown className="knowledge-toolbar-chevron size-icon-md text-slate-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-[70vh] w-64 overflow-y-auto">
                <div className="flex items-center justify-between px-2 py-1.5">
                  <DropdownMenuLabel className="p-0">Filtros</DropdownMenuLabel>
                  {count > 0 && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        filters.onClear();
                      }}
                      className="text-caption font-medium text-slate-700 transition-colors hover:text-slate-950 hover:underline"
                    >
                      Limpiar
                    </button>
                  )}
                </div>
                {filters.groups.map((g) => {
                  const AllIcon = g.allIcon ?? Check;
                  return (
                    <div key={g.key}>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-caption text-muted-foreground">{g.label}</DropdownMenuLabel>
                      <DropdownMenuRadioGroup value={g.value} onValueChange={(value) => filters.onChange(g.key, value)}>
                        <DropdownMenuRadioItem value="all"><AllIcon className="mr-2 size-icon-md" />{g.allLabel}</DropdownMenuRadioItem>
                        {g.options.map((o) => (
                          <DropdownMenuRadioItem key={o.value} value={o.value}>{o.label}</DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </div>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {group && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className={toolbarButton + " knowledge-sort-trigger max-w-full justify-between"} title={"Agrupar: " + groupLabel} aria-label={"Agrupar: " + groupLabel}>
                  <span className="flex min-w-0 items-center gap-2">
                    <Layers className="size-icon-md" />
                    <span className="knowledge-toolbar-label truncate">{group.value === "none" ? "Agrupar" : groupLabel}</span>
                  </span>
                  <ChevronDown className="knowledge-toolbar-chevron size-icon-md text-slate-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>Agrupar por</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup value={group.value} onValueChange={group.onChange}>
                  {group.options.map((o) => (
                    <DropdownMenuRadioItem key={o.value} value={o.value}>{o.label}</DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {sort && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={toolbarButton + " knowledge-sort-trigger min-w-40 max-w-full justify-between"}
                  title={"Ordenar por " + sortLabel}
                  aria-label={"Ordenar por " + sortLabel}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <SortIcon className="size-icon-md" />
                    <span className="knowledge-toolbar-label truncate">{sortLabel}</span>
                  </span>
                  <ChevronDown className="knowledge-toolbar-chevron size-icon-md text-slate-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Ordenar por</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup
                  value={sort.value ? sort.value.key + ":" + sort.value.dir : ""}
                  onValueChange={(value) => {
                    const option = sort.options.find((o) => o.value.key + ":" + o.value.dir === value);
                    if (option) sort.onChange(option.value);
                  }}
                >
                  {sort.options.map(({ label, value }) => (
                    <DropdownMenuRadioItem key={label} value={value.key + ":" + value.dir}>{label}</DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {view && (
            <div className="knowledge-view-toggle ml-1 hidden h-control-lg items-center rounded-xl border-0 bg-white p-1 shadow-none md:flex">
              <button
                type="button"
                onClick={() => view.onChange("grid")}
                className={viewStyle + (view.value === "grid" ? " bg-slate-100 text-slate-950" : " bg-white text-slate-400 hover:bg-slate-50 hover:text-slate-700")}
                title="Vista de tarjetas"
                aria-label="Vista de tarjetas"
                aria-pressed={view.value === "grid"}
              >
                <Grid2X2 className="size-icon-md" strokeWidth={2.25} />
              </button>
              <button
                type="button"
                onClick={() => view.onChange("list")}
                className={viewStyle + (view.value === "list" ? " bg-slate-100 text-slate-950" : " bg-white text-slate-400 hover:bg-slate-50 hover:text-slate-700")}
                title="Vista de lista"
                aria-label="Vista de lista"
                aria-pressed={view.value === "list"}
              >
                <List className="size-icon-md" strokeWidth={2.25} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
