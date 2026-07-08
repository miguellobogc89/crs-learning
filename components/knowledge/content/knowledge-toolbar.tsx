// components/knowledge/content/knowledge-toolbar.tsx
import { SearchInput } from "@/components/ui/search-input";

type Props = {
  breadcrumb?: React.ReactNode;
  search: string;
  onSearchChange: (value: string) => void;
};

export function KnowledgeToolbar({
  breadcrumb,
  search,
  onSearchChange,
}: Props) {
return (
  <div className="mb-6 rounded-2xl border border-border bg-card">
    {breadcrumb ? (
      <div className="border-b border-border px-5 py-3">
        {breadcrumb}
      </div>
    ) : null}

    <div className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
      <SearchInput
        className="max-w-xl flex-1"
        placeholder="Buscar por título, proceso, herramienta o descripción..."
        value={search}
        onChange={onSearchChange}
      />

      <div className="flex flex-wrap gap-2">
        <button
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground hover:bg-surface"
          type="button"
        >
          Todos
        </button>

        <button
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground hover:bg-surface hover:text-foreground"
          type="button"
        >
          Recientes
        </button>

        <button
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground hover:bg-surface hover:text-foreground"
          type="button"
        >
          Estado
        </button>
      </div>
    </div>
  </div>
);
}