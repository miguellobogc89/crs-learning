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
import { CATEGORY_COLOR, SINGLE_SERIES_COLOR, fmtMoney, fmtNumber } from "@/components/analytics/format";

export const dynamic = "force-dynamic";

function Card({ title, subtitle, children, className = "" }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return <section className={"rounded-xl border border-slate-200 bg-white p-5 " + className}>
    <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
    {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
    <div className="mt-4">{children}</div>
  </section>;
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
    <p className="text-xs font-medium text-slate-500">{label}</p>
    <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
    {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
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
    content = <div className="space-y-5 pt-4">
      {notice}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label={`Gasto (${d.months.length} ${d.months.length === 1 ? "mes" : "meses"})`} value={fmtMoney(k.totalSpend)} />
        <Kpi label="Media mensual" value={fmtMoney(k.monthlyAverage)} />
        <Kpi label={k.lastMonth ? `Último mes · ${MONTH_LABEL(k.lastMonth)}` : "Último mes"} value={fmtMoney(k.lastMonthSpend)}
          hint={change === null ? undefined : `${change >= 0 ? "+" : ""}${fmtNumber(Math.round(change))} % frente al mes anterior`} />
        <Kpi label="Facturas · proveedores" value={`${k.invoices} · ${k.suppliers}`} />
      </div>
      <Card title="Gasto por mes y categoría" subtitle="Importe total de cada factura recibida (con impuestos), agrupado por la fecha de la factura.">
        <GroupedBarChart title="Gasto por mes y categoría" series={series}
          groups={d.spend.map(s => ({ key: s.month, label: MONTH_LABEL(s.month), values: s.values }))} />
        {(excluded > 0 || d.excluded.withoutCategory > 0) && <p className="mt-3 text-xs text-slate-500">
          {excluded > 0 && `${excluded} ${excluded === 1 ? "factura no aparece" : "facturas no aparecen"} por no tener fecha o importe. `}
          {d.excluded.withoutCategory > 0 && `${d.excluded.withoutCategory} sin categoría se cuentan en «Otros».`}</p>}
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Proveedores con más gasto" subtitle="En el mismo periodo.">
          <RankingList empty="Sin facturas con proveedor." items={d.topSuppliers.map(s => ({ label: s.name, value: s.spend, display: fmtMoney(s.spend),
            detail: `${s.invoices} ${s.invoices === 1 ? "factura" : "facturas"}` }))} />
        </Card>
        <Card title="Productos con más gasto" subtitle="Líneas de compra (sin suministros), por la fecha real de cada ticket.">
          <RankingList empty="Sin líneas de compra." items={d.topProducts.map(p => ({ label: p.name, value: p.spend, display: fmtMoney(p.spend),
            detail: p.quantity ? `${fmtNumber(p.quantity)} uds.` : undefined }))} />
        </Card>
      </div>
      {d.electricity.length > 0 && <Card title="Consumo eléctrico (kWh)" subtitle="Por el mes en que termina el periodo facturado.">
        <GroupedBarChart title="Consumo eléctrico por mes" unit="kwh"
          series={[{ key: "kwh", label: "kWh", color: SINGLE_SERIES_COLOR }]}
          groups={d.electricity.map(e => ({ key: e.month, label: MONTH_LABEL(e.month), values: { kwh: e.kwh } }))} />
      </Card>}
    </div>;
  }

  return <AppSectionShell sidebar={<AnalyticsNavigation view={view} table={tableKey} />}>
    <AppPageLayout header={<AppPageHeader section={APP_SECTIONS.analytics} title={view === "tablas" ? "Tablas" : "Panel"} />}
      contentClassName="overflow-y-auto pb-6">
      {content}
    </AppPageLayout>
  </AppSectionShell>;
}
