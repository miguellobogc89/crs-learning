import Link from "next/link";
import { Database, GitBranch, Table2 } from "lucide-react";

type EngineType = { id: string; name: string; key: string };

export function EngineNavigation({
  types, selectedId, view,
}: { types: EngineType[]; selectedId?: string; view: "tables" | "relations" }) {
  const item = "flex min-h-9 items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors";
  const active = "bg-[#EDF3FF] font-semibold text-[#0A58FF]";
  const inactive = "text-slate-600 hover:bg-[#F0F4FC] hover:text-slate-900";
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-slate-200/60 px-4 py-4">
        <h2 className="text-[13px] font-semibold text-slate-900">Tablas</h2>
      </div>
      <nav aria-label="Secciones de tablas" className="space-y-1 border-b border-slate-200/60 p-3">
        <Link href="/engine/tables" className={item + " " + (view === "tables" ? active : inactive)}>
          <Database className="h-[18px] w-[18px]" /> Datos
        </Link>
        <Link href="/engine/tables?view=relations" className={item + " " + (view === "relations" ? active : inactive)}>
          <GitBranch className="h-[18px] w-[18px]" /> Relaciones
        </Link>
      </nav>
      <div className="flex min-h-0 flex-1 flex-col">
        <p className="px-5 pb-2 pt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Entidades ({types.length})
        </p>
        <nav aria-label="Entidades" className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {types.map(type => (
            <Link key={type.id} href={`/engine/tables?type=${encodeURIComponent(type.id)}`}
              aria-current={view === "tables" && selectedId === type.id ? "page" : undefined}
              className={item + " " + (view === "tables" && selectedId === type.id ? active : inactive)}>
              <Table2 className="h-4 w-4 shrink-0" />
              <span className="min-w-0 truncate" title={type.name}>{type.name}</span>
            </Link>
          ))}
          {!types.length && <p className="px-3 text-sm text-slate-500">Todavía no hay tablas.</p>}
        </nav>
      </div>
    </div>
  );
}
