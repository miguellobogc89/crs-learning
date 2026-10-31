import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppPageLayout } from "@/components/app/layouts/app-page-layout";
import { AppPageHeader } from "@/components/app/layouts/app-page-header";
import { AppSectionShell } from "@/components/app/section-sidebar";
import { APP_SECTIONS } from "@/lib/navigation/app-sections";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";
import { ANALYTICS_LIMIT, loadAnalyticsData } from "@/lib/analytics/data";
import { availableYears, buildTable, companyOptions, duplicatedLineIssues, CATEGORIES, computeDashboard, computeIncome, computeOverview, computeProducts, MONTH_LABEL, TABLE_KEYS, type Period } from "@/lib/analytics/compute";
import { AnalyticsNavigation } from "@/components/analytics/analytics-navigation";
import { GroupedBarChart } from "@/components/analytics/grouped-bar-chart";
import { RankingList } from "@/components/analytics/ranking-list";
import { DataTable } from "@/components/analytics/data-table";
import { DuplicateLinesReview } from "@/components/analytics/duplicate-lines-review";
import { UnsupportedTypeView } from "@/components/knowledge/templates/unsupported-type-view";
import { TemplateTableStatus } from "@/components/knowledge/templates/template-table-status";
import { TablesOverview } from "@/components/analytics/tables-overview";
import { TableViewProvider } from "@/components/analytics/table-view-context";
import { TableSettingsButton } from "@/components/analytics/table-settings";
import { PurchasesCleanup } from "@/components/purchases/purchases-cleanup";
import { cleanupPlan, cleanupSummary } from "@/lib/purchases/cleanup";
import { tableCards, tablesReview } from "@/lib/analytics/tables-overview";
import { normalizeView } from "@/lib/analytics/table-view";
import { loadTableView } from "@/lib/analytics/table-view.service";
import { templateOverview } from "@/lib/knowledge/intake/templates/service";
import type { PendingGroup } from "@/lib/knowledge/intake/templates/pending";
import { CATEGORY_COLOR, SINGLE_SERIES_COLOR, fmtDate, fmtMoney, fmtNumber } from "@/components/analytics/format";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "general", label: "Visión general" }, { key: "costes", label: "Costes" }, { key: "ingresos", label: "Ingresos" }, { key: "productos", label: "Productos" },
] as const;
type Tab = (typeof TABS)[number]["key"];
/** Income and expenses keep the first two slots of the categorical palette (fixed: colour follows the series). */
const INCOME_COLOR = "#0A58FF", EXPENSE_COLOR = "#eb6834";

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
    <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
  </section>;
}

function Kpi({ label, value, hint, trend }: { label: string; value: string; hint?: string; trend?: "up" | "down" | null }) {
  return <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
    <p className="truncate text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-1 truncate text-xl font-semibold tabular-nums text-slate-900">{value}</p>
    {hint && <p className="mt-0.5 truncate text-[11px] text-slate-500">{trend === "up" ? "▲ " : trend === "down" ? "▼ " : ""}{hint}</p>}
  </div>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500">{children}</div>;
}

const href = (tab: string, periodo: string) => `/analytics?tab=${tab}&periodo=${periodo}`;

/** Tabs and period selector: links, so the page stays a server page and every view has its own address. */
function Toolbar({ tab, years, periodo }: { tab: Tab; years: number[]; periodo: string }) {
  const periods = [...years.map(y => ({ key: String(y), label: String(y) })), { key: "12m", label: "Últimos 12 meses" }];
  const pill = (active: boolean) => "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors " + (active ? "bg-[#0A58FF] text-white" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900");
  return <div className="flex flex-wrap items-center justify-between gap-2">
    <nav aria-label="Vistas" className="flex flex-wrap gap-1 border-b border-slate-200">
      {TABS.map(t => <Link key={t.key} href={href(t.key, periodo)} aria-current={tab === t.key ? "page" : undefined}
        className={"-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors " + (tab === t.key ? "border-[#0A58FF] text-[#0A58FF]" : "border-transparent text-slate-500 hover:text-slate-900")}>{t.label}</Link>)}
    </nav>
    <nav aria-label="Periodo" className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-slate-200/80 bg-white p-1 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      {periods.map(o => <Link key={o.key} href={href(tab, o.key)} aria-current={periodo === o.key ? "page" : undefined} className={pill(periodo === o.key)}>{o.label}</Link>)}
    </nav>
  </div>;
}

type InvoiceRow = Record<string, string | number | boolean | null>;
function InvoiceList({ rows, party }: { rows: InvoiceRow[]; party: "emisor" | "receptor" | "auto" }) {
  if (!rows.length) return <Empty>No hay facturas en este periodo.</Empty>;
  return <ul className="divide-y divide-slate-100">{rows.map((r, i) => {
    const who = party === "auto" ? (r.tipo === "Ingreso" ? r.receptor : r.emisor) : r[party];
    return <li key={i} className="flex items-center justify-between gap-3 py-2 text-[13px]">
      <div className="min-w-0">
        <p className="truncate text-slate-800">{typeof who === "string" ? who : r.tipo === "Ingreso" ? "Cliente sin identificar" : "Sin emisor identificado"}</p>
        <p className="truncate text-[11px] text-slate-500">{typeof r.fecha === "string" ? fmtDate(r.fecha) : "Sin fecha"} · {r.tipo === "Ingreso" ? "Ingreso" : r.categoria}{r.numero ? ` · ${r.numero}` : ""}
          {typeof r.documento === "string" && <> · <a href={`/api/knowledge/intake/files/${r.documento}`} target="_blank" rel="noreferrer" className="text-[#0A58FF] hover:underline">ver</a></>}</p>
      </div>
      <span className={"shrink-0 tabular-nums font-medium " + (r.tipo === "Ingreso" ? "text-slate-900" : "text-slate-900")}>{r.tipo === "Ingreso" ? "+" : ""}{typeof r.total === "number" ? fmtMoney(r.total) : "—"}</span>
    </li>;
  })}</ul>;
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ view?: string; table?: string; periodo?: string; tab?: string; sintabla?: string; pendiente?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
  const canEdit = activeWorkspace.role === "owner" || activeWorkspace.role === "admin";
  const params = await searchParams;
  const view = params.view === "tablas" ? "tablas" : "panel";
  const [data, groups] = await Promise.all([loadAnalyticsData(activeWorkspace.id),
    templateOverview(activeWorkspace.id).then(o => o.grupos as PendingGroup[]).catch(error => { console.warn("[analytics] sin tabla:", error instanceof Error ? error.message : error); return [] as PendingGroup[]; })]);
  const typeKey = (g: PendingGroup) => `${g.familia}|${g.tipo}|${g.subtipo ?? ""}`;
  const missing = groups.filter(g => !g.plantilla && g.documentos.some(d => d.estado !== "ignorado"));
  const pending = missing.map(g => ({ key: typeKey(g), label: g.label, count: g.documentos.filter(d => d.estado !== "ignorado").length }));
  const unsupported = view === "tablas" && params.sintabla ? missing.find(g => typeKey(g) === params.sintabla) : undefined;
  // Tables beyond the base ones: made from documents (templates) and created with the assistant.
  const templateTables = [...(data.templates ?? []).map(t => ({ key: `plantilla:${t.id}`, label: t.nombre })),
    ...(data.custom ?? []).map(t => ({ key: `tabla:${t.typeKey}`, label: t.nombre }))];
  // No (valid) table chosen: the overview of all tables.
  const tableKey = params.table === "proveedores" ? "empresas" : TABLE_KEYS.includes(params.table as (typeof TABLE_KEYS)[number]) || templateTables.some(t => t.key === params.table) ? params.table! : null;
  const table = view === "tablas" && !unsupported && tableKey ? buildTable(data, tableKey) : null;
  const tableView = table ? normalizeView(await loadTableView(session.user.id, activeWorkspace.id, table.key).catch(error => {
    console.warn("[analytics] vista de tabla:", error instanceof Error ? error.message : error); return null; }), table.columns) : null;

  const notice = data.truncated ? <p className="rounded-lg bg-amber-50 px-4 py-2 text-xs text-amber-800">
    Hay más de {fmtNumber(ANALYTICS_LIMIT)} registros en alguna tabla: la analítica usa los {fmtNumber(ANALYTICS_LIMIT)} primeros.</p> : null;

  let content: React.ReactNode;
  const templateGroup = tableKey?.startsWith("plantilla:") ? groups.find(g => g.plantilla && `plantilla:${g.plantilla.id}` === tableKey) : undefined;
  if (unsupported) {
    content = <div className="pt-4"><UnsupportedTypeView group={unsupported} canEdit={canEdit} /></div>;
  } else if (table) {
    content = <div className="space-y-4 pt-4">{notice}
      {templateGroup && <TemplateTableStatus group={templateGroup} canEdit={canEdit} />}
      {(table.key === "facturas" || table.key === "compras") && <DuplicateLinesReview issues={duplicatedLineIssues(data)} canEdit={canEdit} />}
      {table.key === "compras" && <PurchasesCleanup summary={cleanupSummary(cleanupPlan(data))} canEdit={canEdit} />}
      <DataTable key={`${table.key}|${params.pendiente ?? ""}`} table={table} canEdit canManage={canEdit} companies={table.key === "facturas" ? companyOptions(data) : []}
        initialFilters={params.pendiente && table.columns.some(c => c.key === params.pendiente) ? { [params.pendiente]: "__empty" } : {}} /></div>;
  } else if (view === "tablas") {
    const all = [...TABLE_KEYS, ...templateTables.map(t => t.key)].map(key => buildTable(data, key));
    content = <>{notice && <div className="pt-4">{notice}</div>}<TablesOverview tables={tableCards(all)}
      review={tablesReview({ invoices: all[0], duplicatedLines: duplicatedLineIssues(data).length, groups, tables: all })} /></>;
  } else {
    const tab: Tab = TABS.some(t => t.key === params.tab) ? params.tab as Tab : "general";
    const years = availableYears(data);
    const periodo = params.periodo === "12m" ? "12m" : years.includes(Number(params.periodo)) ? String(Number(params.periodo)) : years[0] ? String(years[0]) : "12m";
    const period: Period = periodo === "12m" ? 12 : { year: Number(periodo) };
    const costs = computeDashboard(data, period);
    const months = costs.months;
    const range = months.length ? `${MONTH_LABEL(months[0])} – ${MONTH_LABEL(months.at(-1)!)}` : "";
    const invoices = buildTable(data, "facturas").rows.filter(r => typeof r.fecha === "string" && months.includes(r.fecha.slice(0, 7)));
    const byCategory = costs.categories.map(c => ({ key: c, total: costs.spend.reduce((a, m) => a + m.values[c], 0) })).sort((a, b) => b.total - a.total);
    const positive = byCategory.reduce((a, c) => a + Math.max(0, c.total), 0) || 1;
    const categoryRanking = <RankingList compact empty="Sin gasto en el periodo." items={byCategory.map(c => ({ label: CATEGORIES.find(x => x.key === c.key)!.label, value: c.total,
      display: fmtMoney(c.total), color: CATEGORY_COLOR[c.key], detail: c.total > 0 ? `${fmtNumber(Math.round(c.total / positive * 100))} %` : undefined }))} />;
    const suppliersRanking = <RankingList compact empty="Sin facturas con proveedor." items={costs.topSuppliers.slice(0, 5).map(s => ({ label: s.name, value: s.spend,
      display: fmtMoney(s.spend), detail: `${s.invoices} ${s.invoices === 1 ? "factura" : "facturas"}` }))} />;
    const ownHint = <p className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-700">
      Para ver tus <b>ingresos</b>, marca tu empresa como «Mi empresa» en <Link className="font-medium text-[#0A58FF] hover:underline" href="/analytics?view=tablas&table=empresas">Tablas → Empresas</Link>:
      las facturas que emite pasarán a contar como ingresos. También puedes cambiar el «Tipo» de una factura en <Link className="font-medium text-[#0A58FF] hover:underline" href="/analytics?view=tablas&table=facturas">Tablas → Facturas</Link>.</p>;

    let body: React.ReactNode;
    if (tab === "general") {
      const o = computeOverview(data, period);
      body = <>
        {!o.hasOwnCompany && o.invoices.ingresos === 0 && ownHint}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Ingresos" value={fmtMoney(o.totals.ingresos)} hint={`${o.invoices.ingresos} ${o.invoices.ingresos === 1 ? "factura" : "facturas"} emitidas`} />
          <Kpi label="Gastos" value={fmtMoney(o.totals.gastos)} hint={`${o.invoices.gastos} ${o.invoices.gastos === 1 ? "factura" : "facturas"} recibidas`} />
          <Kpi label="Resultado" value={fmtMoney(o.totals.resultado)} hint={o.totals.margen === null ? "Sin ingresos en el periodo" : `Margen ${fmtNumber(o.totals.margen)} %`}
            trend={o.totals.margen === null ? null : o.totals.resultado >= 0 ? "up" : "down"} />
          <Kpi label="Proveedores" value={String(costs.kpis.suppliers)} hint={range} />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title="Ingresos y gastos por mes" subtitle="Total con impuestos de cada factura, por su fecha" href="/analytics?view=tablas&table=facturas">
            <GroupedBarChart compact title="Ingresos y gastos por mes" series={[{ key: "ingresos", label: "Ingresos", color: INCOME_COLOR }, { key: "gastos", label: "Gastos", color: EXPENSE_COLOR }]}
              groups={o.perMonth.map(p => ({ key: p.month, label: MONTH_LABEL(p.month), values: { ingresos: p.ingresos, gastos: p.gastos } }))} />
          </Panel>
          <Panel title="Gasto por categoría" subtitle={range ? `Acumulado · ${range}` : undefined} href="/analytics?view=tablas&table=facturas">{categoryRanking}</Panel>
          <Panel title="Proveedores con más gasto" subtitle={range || undefined} href="/analytics?view=tablas&table=empresas">{suppliersRanking}</Panel>
          <Panel title="Últimas facturas" href="/analytics?view=tablas&table=facturas"><InvoiceList rows={invoices.slice(0, 5)} party="auto" /></Panel>
        </div>
      </>;
    } else if (tab === "costes") {
      const k = costs.kpis;
      const change = k.previousMonthSpend ? (k.lastMonthSpend - k.previousMonthSpend) / Math.abs(k.previousMonthSpend) * 100 : null;
      const series = costs.categories.map(c => ({ key: c, label: CATEGORIES.find(x => x.key === c)!.label, color: CATEGORY_COLOR[c] }));
      const excluded = costs.excluded.withoutDate + costs.excluded.withoutAmount;
      body = <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Gasto del periodo" value={fmtMoney(k.totalSpend)} hint={range} />
          <Kpi label="Media mensual" value={fmtMoney(k.monthlyAverage)} />
          <Kpi label={k.lastMonth ? `Último mes · ${MONTH_LABEL(k.lastMonth)}` : "Último mes"} value={fmtMoney(k.lastMonthSpend)}
            trend={change === null ? null : change >= 0 ? "up" : "down"} hint={change === null ? undefined : `${change >= 0 ? "+" : ""}${fmtNumber(Math.round(change))} % vs. mes anterior`} />
          <Kpi label="Facturas · proveedores" value={`${k.invoices} · ${k.suppliers}`} />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title="Gasto por mes y categoría" subtitle="Total con impuestos de cada factura recibida, por su fecha" href="/analytics?view=tablas&table=facturas">
            <GroupedBarChart compact title="Gasto por mes y categoría" series={series} groups={costs.spend.map(s => ({ key: s.month, label: MONTH_LABEL(s.month), values: s.values }))} />
          </Panel>
          <Panel title="Reparto por categoría" subtitle={range ? `Acumulado · ${range}` : undefined} href="/analytics?view=tablas&table=facturas">{categoryRanking}</Panel>
          <Panel title="Detalle del gasto" subtitle="Por tipo de factura: luz, agua, teléfono, compras, tickets…" href="/analytics?view=tablas&table=facturas">
            <RankingList compact empty="Sin gasto en el periodo." items={costs.subcategories.slice(0, 6).map(s => ({ label: s.label, value: s.total, display: fmtMoney(s.total),
              color: CATEGORY_COLOR[s.category], detail: `${s.invoices} ${s.invoices === 1 ? "factura" : "facturas"}` }))} />
          </Panel>
          <Panel title="Proveedores con más gasto" subtitle={range || undefined} href="/analytics?view=tablas&table=empresas">{suppliersRanking}</Panel>
          {costs.electricity.length > 0 && <Panel title="Consumo eléctrico" subtitle="kWh por mes de fin del periodo facturado" href="/analytics?view=tablas&table=consumos">
            <GroupedBarChart compact title="Consumo eléctrico por mes" unit="kwh" series={[{ key: "kwh", label: "kWh", color: SINGLE_SERIES_COLOR }]}
              groups={costs.electricity.map(e => ({ key: e.month, label: MONTH_LABEL(e.month), values: { kwh: e.kwh } }))} />
          </Panel>}
          <Panel title="Últimos gastos" href="/analytics?view=tablas&table=facturas"><InvoiceList rows={invoices.filter(r => r.tipo !== "Ingreso").slice(0, 5)} party="emisor" /></Panel>
        </div>
        {(excluded > 0 || costs.excluded.withoutCategory > 0) && <p className="text-[11px] text-slate-500">
          {excluded > 0 && `${excluded} ${excluded === 1 ? "factura no aparece" : "facturas no aparecen"} en los gráficos por no tener fecha o importe. `}
          {costs.excluded.withoutCategory > 0 && `${costs.excluded.withoutCategory} sin categoría se cuentan en «Otros».`}</p>}
      </>;
    } else if (tab === "ingresos") {
      const inc = computeIncome(data, period);
      const o = computeOverview(data, period);
      body = <>
        {!inc.hasOwnCompany && inc.invoices === 0 && ownHint}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Ingresos del periodo" value={fmtMoney(inc.total)} hint={range} />
          <Kpi label="Facturas emitidas" value={String(inc.invoices)} />
          <Kpi label="Factura media" value={fmtMoney(inc.averageInvoice)} />
          <Kpi label="Clientes" value={String(inc.customers.length)} />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title="Ingresos por mes" subtitle="Facturas emitidas, por su fecha" href="/analytics?view=tablas&table=facturas">
            {inc.invoices ? <GroupedBarChart compact title="Ingresos por mes" series={[{ key: "total", label: "Ingresos", color: INCOME_COLOR }]}
              groups={inc.perMonth.map(p => ({ key: p.month, label: MONTH_LABEL(p.month), values: { total: p.total } }))} /> : <Empty>Todavía no hay facturas emitidas en este periodo.</Empty>}
          </Panel>
          <Panel title="Clientes" subtitle="Lo facturado a cada uno" href="/analytics?view=tablas&table=empresas">
            <RankingList compact empty="Sin facturas emitidas." items={inc.customers.slice(0, 5).map(c => ({ label: c.name, value: c.total, display: fmtMoney(c.total),
              color: INCOME_COLOR, detail: `${c.invoices} ${c.invoices === 1 ? "factura" : "facturas"}` }))} />
          </Panel>
          <Panel title="Ingresos frente a gastos" subtitle="Lo que entra y lo que sale cada mes">
            <GroupedBarChart compact title="Ingresos frente a gastos" series={[{ key: "ingresos", label: "Ingresos", color: INCOME_COLOR }, { key: "gastos", label: "Gastos", color: EXPENSE_COLOR }]}
              groups={o.perMonth.map(p => ({ key: p.month, label: MONTH_LABEL(p.month), values: { ingresos: p.ingresos, gastos: p.gastos } }))} />
          </Panel>
          <Panel title="Últimas facturas emitidas" href="/analytics?view=tablas&table=facturas"><InvoiceList rows={invoices.filter(r => r.tipo === "Ingreso").slice(0, 5)} party="receptor" /></Panel>
        </div>
      </>;
    } else {
      const p = computeProducts(data, period);
      body = <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Gasto en productos" value={fmtMoney(p.spend)} hint={range} />
          <Kpi label="Productos distintos" value={String(p.distinct)} />
          <Kpi label="Líneas de compra" value={String(p.lines)} hint={p.lines ? `${fmtMoney(p.spend / p.lines)} de media` : undefined} />
          <Kpi label="Proveedores de producto" value={String(p.suppliers)} />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title="Productos con más gasto" subtitle="Líneas de compra (sin suministros)" href="/analytics?view=tablas&table=compras">
            <RankingList compact empty="Sin líneas de compra." items={p.bySpend.slice(0, 5).map(x => ({ label: x.name, value: x.spend, display: fmtMoney(x.spend),
              detail: x.quantity ? `${fmtNumber(x.quantity)} uds.` : undefined }))} />
          </Panel>
          <Panel title="Productos más comprados" subtitle="Por unidades" href="/analytics?view=tablas&table=compras">
            <RankingList compact empty="Sin cantidades en las líneas." items={p.byQuantity.filter(x => x.quantity > 0).slice(0, 5).map(x => ({ label: x.name, value: x.quantity,
              display: `${fmtNumber(x.quantity)} uds.`, detail: fmtMoney(x.spend) }))} />
          </Panel>
          <Panel title="Cambios de precio" subtitle="Precio unitario: primera y última compra del periodo" href="/analytics?view=tablas&table=compras">
            {p.prices.length ? <ul className="divide-y divide-slate-100">{p.prices.slice(0, 5).map(x => <li key={x.name} className="flex items-center justify-between gap-3 py-2 text-[13px]">
              <div className="min-w-0"><p className="truncate text-slate-800" title={x.name}>{x.name}</p>
                <p className="text-[11px] text-slate-500">{fmtMoney(x.first)} → {fmtMoney(x.last)} · {x.purchases} compras{x.suppliers > 1 ? ` · ${x.suppliers} proveedores` : ""}</p></div>
              <span className="shrink-0 tabular-nums text-xs font-semibold text-slate-900">{x.change > 0 ? "▲ +" : x.change < 0 ? "▼ " : ""}{fmtNumber(x.change)} %</span>
            </li>)}</ul> : <Empty>Hace falta comprar un producto al menos dos veces con precio unitario para ver su evolución.</Empty>}
          </Panel>
          <Panel title="A quién compras los productos" href="/analytics?view=tablas&table=empresas">
            <RankingList compact empty="Sin compras de producto." items={p.bySupplier.slice(0, 5).map(s => ({ label: s.name, value: s.spend, display: fmtMoney(s.spend),
              detail: `${s.products} ${s.products === 1 ? "producto" : "productos"}` }))} />
          </Panel>
        </div>
        <p className="text-[11px] text-slate-500">El inventario (existencias) necesita albaranes o recuentos de almacén; cuando los importes, aparecerá aquí.</p>
      </>;
    }
    content = <div className="space-y-3 pt-4">
      {notice}
      <Toolbar tab={tab} years={years} periodo={periodo} />
      {body}
    </div>;
  }

  // Analítica > Tablas, and the table (or document type) as the title, with its settings next to it.
  const crumbs = table || unsupported ? [{ label: "Tablas", href: "/analytics?view=tablas" }] : [];
  const title = table ? table.label : unsupported ? unsupported.label : view === "tablas" ? "Tablas" : "Panel";
  const page = <AppPageLayout header={<AppPageHeader section={APP_SECTIONS.analytics} items={crumbs} title={title} actions={table ? <TableSettingsButton /> : undefined} />}
    contentClassName="overflow-y-auto pb-6">
    {content}
  </AppPageLayout>;
  return <AppSectionShell sidebar={<AnalyticsNavigation view={view} table={table?.key} extra={templateTables} pending={pending} sintabla={unsupported ? params.sintabla : undefined} />}>
    {table && tableView ? <TableViewProvider key={table.key} tableKey={table.key} columns={table.columns} initial={tableView}>{page}</TableViewProvider> : page}
  </AppSectionShell>;
}
