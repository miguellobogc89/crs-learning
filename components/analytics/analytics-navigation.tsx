import Link from "next/link";
import { LayoutDashboard, Table2 } from "lucide-react";

const TABLES = [
  { key: "facturas", label: "Facturas" }, { key: "compras", label: "Productos comprados" }, { key: "proveedores", label: "Proveedores" },
  { key: "suministros", label: "Suministros" }, { key: "consumos", label: "Consumo eléctrico" },
];

/** Analytics side navigation: the dashboard and the useful tables (no relation or tax tables). */
export function AnalyticsNavigation({ view, table }: { view: "panel" | "tablas"; table?: string }) {
  const item = "flex min-h-9 items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors";
  const active = "bg-[#EDF3FF] font-semibold text-[#0A58FF]";
  const inactive = "text-slate-600 hover:bg-[#F0F4FC] hover:text-slate-900";
  return <div className="flex h-full min-h-0 flex-col">
    <div className="border-b border-slate-200/60 px-4 py-4"><h2 className="text-[13px] font-semibold text-slate-900">Analítica</h2></div>
    <nav aria-label="Panel" className="space-y-1 border-b border-slate-200/60 p-3">
      <Link href="/analytics" aria-current={view === "panel" ? "page" : undefined} className={item + " " + (view === "panel" ? active : inactive)}>
        <LayoutDashboard className="h-[18px] w-[18px]" /> Panel</Link>
    </nav>
    <p className="px-5 pb-2 pt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Tablas</p>
    <nav aria-label="Tablas" className="space-y-1 px-3 pb-4">
      {TABLES.map(t => <Link key={t.key} href={`/analytics?view=tablas&table=${t.key}`} aria-current={view === "tablas" && table === t.key ? "page" : undefined}
        className={item + " " + (view === "tablas" && table === t.key ? active : inactive)}>
        <Table2 className="h-4 w-4 shrink-0" /> {t.label}</Link>)}
    </nav>
  </div>;
}
