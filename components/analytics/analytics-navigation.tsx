import Link from "next/link";
import { FileQuestion, LayoutDashboard, LayoutGrid, Table2 } from "lucide-react";

const TABLES = [
  { key: "facturas", label: "Facturas" }, { key: "compras", label: "Productos comprados" }, { key: "empresas", label: "Empresas" },
  { key: "suministros", label: "Suministros" }, { key: "consumos", label: "Consumo eléctrico" },
];

export type PendingType = { key: string; label: string; count: number };

/**
 * Analytics side navigation: the dashboard, every table (the base ones and those created from your documents, as
 * one list) and, below, the document types still without a table. Creating a table moves its type up into Tablas.
 */
export function AnalyticsNavigation({ view, table, extra = [], pending = [], sintabla }: {
  view: "panel" | "tablas"; table?: string; extra?: { key: string; label: string }[]; pending?: PendingType[]; sintabla?: string;
}) {
  const item = "flex min-h-9 items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors";
  const active = "bg-[#EDF3FF] font-semibold text-[#0A58FF]";
  const inactive = "text-slate-600 hover:bg-[#F0F4FC] hover:text-slate-900";
  const tables = [...TABLES, ...extra];
  const overview = view === "tablas" && !table && !sintabla;
  const heading = "flex items-center justify-between px-5 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500";
  return <div className="flex h-full min-h-0 flex-col overflow-y-auto">
    <div className="border-b border-slate-200/60 px-4 py-4"><h2 className="text-[13px] font-semibold text-slate-900">Analítica</h2></div>
    <nav aria-label="Panel" className="space-y-1 border-b border-slate-200/60 p-3">
      <Link href="/analytics" aria-current={view === "panel" ? "page" : undefined} className={item + " " + (view === "panel" ? active : inactive)}>
        <LayoutDashboard className="h-[18px] w-[18px]" /> Panel</Link>
    </nav>
    <p className={heading + " pt-4"}>Tablas<span className="font-medium tabular-nums text-slate-400">{tables.length}</span></p>
    <nav aria-label="Tablas" className="space-y-1 px-3 pb-4">
      <Link href="/analytics?view=tablas" aria-current={overview ? "page" : undefined} className={item + " " + (overview ? active : inactive)}>
        <LayoutGrid className="h-4 w-4 shrink-0" /> Vista general</Link>
      {tables.map(t => {
        const on = view === "tablas" && !sintabla && table === t.key;
        return <Link key={t.key} href={`/analytics?view=tablas&table=${encodeURIComponent(t.key)}`} aria-current={on ? "page" : undefined} className={item + " " + (on ? active : inactive)}>
          <Table2 className="h-4 w-4 shrink-0" /> <span className="min-w-0 truncate">{t.label}</span></Link>;
      })}
    </nav>
    {pending.length > 0 && <div className="border-t border-slate-200/60 pt-4">
      <p className={heading}>Sin tabla<span className="font-medium tabular-nums text-slate-400">{pending.reduce((n, p) => n + p.count, 0)}</span></p>
      <nav aria-label="Documentos sin tabla" className="space-y-1 px-3 pb-4">
        {pending.map(p => {
          const on = view === "tablas" && sintabla === p.key;
          return <Link key={p.key} href={`/analytics?view=tablas&sintabla=${encodeURIComponent(p.key)}`} aria-current={on ? "page" : undefined} className={item + " " + (on ? active : inactive)}>
            <FileQuestion className={"h-4 w-4 shrink-0 " + (on ? "" : "text-amber-500")} /> <span className="min-w-0 flex-1 truncate">{p.label}</span>
            <span className="rounded-full bg-amber-50 px-1.5 text-[11px] font-medium tabular-nums text-amber-700">{p.count}</span></Link>;
        })}
      </nav>
    </div>}
  </div>;
}
