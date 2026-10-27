import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppPageLayout } from "@/components/app/layouts/app-page-layout";
import { AppPageHeader } from "@/components/app/layouts/app-page-header";
import { AppSectionShell } from "@/components/app/section-sidebar";
import { APP_SECTIONS } from "@/lib/navigation/app-sections";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";
import { ANALYTICS_LIMIT, loadAnalyticsData } from "@/lib/analytics/data";
import { buildTable, CATEGORIES, computeDashboard, MONTH_LABEL, TABLE_KEYS } from "@/lib/analytics/compute";
import { AnalyticsNavigation } from "@/components/analytics/analytics-navigation";
import { GroupedBarChart } from "@/components/analytics/grouped-bar-chart";
import { RankingList } from "@/components/analytics/ranking-list";
import { DataTable } from "@/components/analytics/data-table";
import { CATEGORY_COLOR, SINGLE_SERIES_COLOR, fmtDate, fmtMoney, fmtNumber } from "@/components/analytics/format";

export const dynamic = "force-dynamic";

/** A compact dashboard tile: fixed height so the panel reads as a grid (two per row on a laptop screen). */
function Panel({ title, subtitle, href, children }: { title: string; subtitle?: string; href?: string; children: React.ReactNode }) {
  return <section className="flex h-[300px] min-w-0 flex-col rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
    <header className="mb-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="truncate text-[13px] font-semibold text-slate-900">{title}</h2>
        {subtitle && <p className="truncate text-[11px] text-slate-500" title={subtitle}>{subtitle}</p>}
      </div>
      {href && <Link href={href} className="shrink-0 rounded-md px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-50 hover:text-[#0A58FF]">Ver tabla →</Link>}
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
  </section>;
}

function Kpi({ label, value, hint, trend }: { label: string; value: string; hint?: string; trend?: "up" | "down" | null }) {
  return <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
    <p className="truncate text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-1 truncate text-xl font-semibold tabular-nums text-slate-900">{value}</p>
    {hint && <p className="mt-0.5 truncate text-[11px] text-slate-500">{trend === "up" ? "▲ " : trend === "down" ? "▼ " : ""}{hint}</p>}
  </div>;
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ view?: string; table?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
  const params = await searchParams;
  const view = params.view === "tablas" ? "tablas" : "panel";
  const tableKey = TABLE_KEYS.includes(params.table as (typeof TABLE_KEYS)[number]) ? params.table! : "facturas";
  const data = await loadAnalyticsData(activeWorkspace.id);

  const notice = data.truncated ? <p className="rounded-lg bg-amber-50 px-4 py-2 text-xs text-amber-800">
    Hay más de {fmtNumber(ANALYTICS_LIMIT)} registros en alguna tabla: la analítica usa los {fmtNumber(ANALYTICS_LIMIT)} primeros.</p> : null;

  let content: React.ReactNode;
  if (view === "tablas") {
    const table = buildTable(data, tableKey);
    content = <div className="space-y-4 pt-4">{notice}<DataTable table={table} /></div>;
  } else {
    const d = computeDashboard(data);
    const k = d.kpis;
    const change = k.previousMonthSpend ? (k.lastMonthSpend - k.previousMonthSpend) / Math.abs(k.previousMonthSpend) * 100 : null;
    const series = d.categories.map(c => ({ key: c, label: CATEGORIES.find(x => x.key === c)!.label, color: CATEGORY_COLOR[c] }));
    const excluded = d.excluded.withoutDate + d.excluded.withoutAmount;
    const byCategory = d.categories.map(c => ({ key: c, total: d.spend.reduce((a, m) => a + m.values[c], 0) })).sort((a, b) => b.total - a.total);
    const positive = byCategory.reduce((a, c) => a + Math.max(0, c.total), 0) || 1;
    const recent = buildTable(data, "facturas").rows.slice(0, 7);
    const period = d.months.length ? `${MONTH_LABEL(d.months[0])} – ${MONTH_LABEL(d.months.at(-1)!)}` : "";
    content = <div className="space-y-3 pt-4">
      {notice}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={`Gasto · ${d.months.length} ${d.months.length === 1 ? "mes" : "meses"}`} value={fmtMoney(k.totalSpend)} hint={period} />
        <Kpi label="Media mensual" value={fmtMoney(k.monthlyAverage)} />
        <Kpi label={k.lastMonth ? `Último mes · ${MONTH_LABEL(k.lastMonth)}` : "Último mes"} value={fmtMoney(k.lastMonthSpend)}
          trend={change === null ? null : change >= 0 ? "up" : "down"}
          hint={change === null ? undefined : `${change >= 0 ? "+" : ""}${fmtNumber(Math.round(change))} % vs. mes anterior`} />
        <Kpi label="Facturas · proveedores" value={`${k.invoices} · ${k.suppliers}`} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Gasto por mes y categoría" subtitle="Total con impuestos de cada factura recibida, por su fecha" href="/analytics?view=tablas&table=facturas">
          <GroupedBarChart compact title="Gasto por mes y categoría" series={series}
            groups={d.spend.map(s => ({ key: s.month, label: MONTH_LABEL(s.month), values: s.values }))} />
        </Panel>
        <Panel title="Reparto por categoría" subtitle={period ? `Gasto acumulado · ${period}` : undefined} href="/analytics?view=tablas&table=facturas">
          <RankingList compact empty="Sin gasto en el periodo." items={byCategory.map(c => ({ label: CATEGORIES.find(x => x.key === c.key)!.label, value: c.total,
            display: fmtMoney(c.total), color: CATEGORY_COLOR[c.key], detail: c.total > 0 ? `${fmtNumber(Math.round(c.total / positive * 100))} %` : undefined }))} />
        </Panel>
        <Panel title="Proveedores con más gasto" subtitle={period || undefined} href="/analytics?view=tablas&table=proveedores">
          <RankingList compact empty="Sin facturas con proveedor." items={d.topSuppliers.map(s => ({ label: s.name, value: s.spend, display: fmtMoney(s.spend),
            detail: `${s.invoices} ${s.invoices === 1 ? "factura" : "facturas"}` }))} />
        </Panel>
        <Panel title="Productos con más gasto" subtitle="Líneas de compra (sin suministros)" href="/analytics?view=tablas&table=compras">
          <RankingList compact empty="Sin líneas de compra." items={d.topProducts.slice(0, 6).map(p => ({ label: p.name, value: p.spend, display: fmtMoney(p.spend),
            detail: p.quantity ? `${fmtNumber(p.quantity)} uds.` : undefined }))} />
        </Panel>
        {d.electricity.length > 0 && <Panel title="Consumo eléctrico" subtitle="kWh por mes de fin del periodo facturado" href="/analytics?view=tablas&table=consumos">
          <GroupedBarChart compact title="Consumo eléctrico por mes" unit="kwh"
            series={[{ key: "kwh", label: "kWh", color: SINGLE_SERIES_COLOR }]}
            groups={d.electricity.map(e => ({ key: e.month, label: MONTH_LABEL(e.month), values: { kwh: e.kwh } }))} />
        </Panel>}
        <Panel title="Últimas facturas" href="/analytics?view=tablas&table=facturas">
          {recent.length ? <ul className="divide-y divide-slate-100">
            {recent.map((r, i) => <li key={i} className="flex items-center justify-between gap-3 py-2 text-[13px]">
              <div className="min-w-0">
                <p className="truncate text-slate-800">{r.proveedor ?? "Sin emisor identificado"}</p>
                <p className="truncate text-[11px] text-slate-500">{r.fecha ? fmtDate(String(r.fecha)) : "Sin fecha"} · {r.categoria}{r.numero ? ` · ${r.numero}` : ""}</p>
              </div>
              <span className="shrink-0 tabular-nums font-medium text-slate-900">{typeof r.total === "number" ? fmtMoney(r.total) : "—"}</span>
            </li>)}</ul> : <p className="py-6 text-center text-sm text-slate-500">Todavía no hay facturas.</p>}
        </Panel>
      </div>
      {(excluded > 0 || d.excluded.withoutCategory > 0) && <p className="text-[11px] text-slate-500">
        {excluded > 0 && `${excluded} ${excluded === 1 ? "factura no aparece" : "facturas no aparecen"} en los gráficos por no tener fecha o importe. `}
        {d.excluded.withoutCategory > 0 && `${d.excluded.withoutCategory} sin categoría se cuentan en «Otros».`}</p>}
    </div>;
  }

  return <AppSectionShell sidebar={<AnalyticsNavigation view={view} table={tableKey} />}>
    <AppPageLayout header={<AppPageHeader section={APP_SECTIONS.analytics} title={view === "tablas" ? "Tablas" : "Panel"} />}
      contentClassName="overflow-y-auto pb-6">
      {content}
    </AppPageLayout>
  </AppSectionShell>;
}
