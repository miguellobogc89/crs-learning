import type { AnalyticsData, Row } from "./data";

/**
 * Pure analytics over the workspace's records: spend per month and category, KPIs, top suppliers and products,
 * electricity consumption, and the "useful tables" (no relation or tax tables). Amounts are the values as stored
 * (decimal strings); nothing is invented: invoices without a usable date or amount are counted apart.
 */
export const CATEGORIES = [
  { key: "suministros", label: "Suministros" }, { key: "compras", label: "Compras" }, { key: "servicios", label: "Servicios" },
  { key: "alquiler", label: "Alquiler" }, { key: "rectificativas", label: "Rectificativas" }, { key: "otros", label: "Otros" },
] as const;
export type CategoryKey = (typeof CATEGORIES)[number]["key"];

export const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v);
  return null;
};
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const month = (v: unknown) => { const d = str(v); return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.slice(0, 7) : null; };
const round = (n: number) => Math.round(n * 100) / 100;

export const MONTH_LABEL = (m: string) => {
  const [y, mm] = m.split("-").map(Number);
  return `${["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][mm - 1]} ${String(y).slice(2)}`;
};
const addMonths = (m: string, delta: number) => {
  const [y, mm] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mm - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

function indexes(data: AnalyticsData) {
  const byId = new Map<string, Row>([...data.invoices, ...data.lines, ...data.companies, ...data.supplies, ...data.consumption].map(r => [r.id, r]));
  const issuerOf = new Map(data.relations.invoice_issuer.map(([company, invoice]) => [invoice, company]));
  const customerOf = new Map(data.relations.invoice_customer.map(([company, invoice]) => [invoice, company]));
  const invoiceOfLine = new Map(data.relations.invoice_lines.map(([invoice, line]) => [line, invoice]));
  const invoiceOfConsumption = new Map(data.relations.invoice_energy_consumption.map(([invoice, c]) => [c, invoice]));
  const supplyOfInvoice = new Map(data.relations.invoice_supply_point.map(([supply, invoice]) => [invoice, supply]));
  const holderOfSupply = new Map(data.relations.supply_point_holder.map(([company, supply]) => [supply, company]));
  return { byId, issuerOf, customerOf, invoiceOfLine, invoiceOfConsumption, supplyOfInvoice, holderOfSupply };
}

const companyName = (r: Row | undefined) => r ? str(r.values.trade_name) ?? str(r.values.legal_name) ?? str(r.values.tax_identifier) ?? "Sin nombre" : null;
const invoiceAmount = (inv: Row) => num(inv.values.total_amount) ?? num(inv.values.net_amount);
const category = (inv: Row): CategoryKey => {
  const c = str(inv.values.expense_category);
  return (CATEGORIES.some(x => x.key === c) ? c : "otros") as CategoryKey;
};

export type Dashboard = {
  months: string[];
  spend: { month: string; values: Record<CategoryKey, number>; total: number }[];
  categories: CategoryKey[];
  kpis: { totalSpend: number; invoices: number; suppliers: number; monthlyAverage: number; lastMonth: string | null; lastMonthSpend: number; previousMonthSpend: number };
  topSuppliers: { name: string; spend: number; invoices: number }[];
  topProducts: { name: string; quantity: number; spend: number; lines: number }[];
  electricity: { month: string; kwh: number }[];
  excluded: { withoutDate: number; withoutAmount: number; withoutCategory: number };
};

/** kWh per month the billed period ends (a printed total wins over the sum of its periods, never both). */
export function electricityByMonth(data: AnalyticsData): { month: string; kwh: number }[] {
  const ix = indexes(data);
  const kwhByMonth = new Map<string, { total: number | null; periods: number }>();
  for (const c of data.consumption) {
    const invoice = ix.byId.get(ix.invoiceOfConsumption.get(c.id) ?? "");
    const m = invoice ? month(invoice.values.period_end) ?? month(invoice.values.issue_date) : null;
    const kwh = num(c.values.energy_kwh);
    if (!m || kwh === null) continue;
    const entry = kwhByMonth.get(m) ?? { total: null, periods: 0 };
    // A printed total wins over the sum of its periods (never both).
    if (/total/i.test(str(c.values.period) ?? "")) entry.total = (entry.total ?? 0) + kwh; else entry.periods += kwh;
    kwhByMonth.set(m, entry);
  }
  return [...kwhByMonth].map(([m, e]) => ({ month: m, kwh: round(e.total ?? e.periods) })).sort((a, b) => a.month.localeCompare(b.month));
}

const receivedInvoices = (data: AnalyticsData) => data.invoices.filter(i => !/emitid|venta|issued|sale/i.test(str(i.values.direction) ?? ""));

/** Years with dated spend, most recent first (the year selector). */
export function availableYears(data: AnalyticsData): number[] {
  return [...new Set(receivedInvoices(data).map(i => month(i.values.issue_date)).filter((m): m is string => !!m).map(m => Number(m.slice(0, 4))))].sort((a, b) => b - a);
}

/**
 * Period of the dashboard: the last `monthsBack` months with data (default), or a calendar `year` (January to
 * December; the current year stops at the current month, so future months are not shown as zero spend).
 */
export type Period = number | { monthsBack?: number; year?: number; today?: Date };

export function computeDashboard(data: AnalyticsData, period: Period = 12): Dashboard {
  const { monthsBack = 12, year, today = new Date() } = typeof period === "number" ? { monthsBack: period } : period;
  const ix = indexes(data);
  // Spend: received invoices (issued ones, i.e. sales, are not spend).
  const received = receivedInvoices(data);
  const dated = received.filter(i => month(i.values.issue_date) && invoiceAmount(i) !== null);
  const latest = dated.map(i => month(i.values.issue_date)!).sort().at(-1) ?? null;
  const earliest = dated.map(i => month(i.values.issue_date)!).sort()[0] ?? null;
  const months: string[] = [];
  if (year) {
    const now = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    for (let mm = 1; mm <= 12; mm++) {
      const m = `${year}-${String(mm).padStart(2, "0")}`;
      if (year === today.getFullYear() && m > now && (!latest || m > latest)) break;
      months.push(m);
    }
  } else if (latest && earliest) {
    let m = latest;
    for (let i = 0; i < monthsBack && m >= earliest; i++) { months.unshift(m); m = addMonths(m, -1); }
  }
  const inRange = dated.filter(i => months.includes(month(i.values.issue_date)!));
  const spend = months.map(m => {
    const values = Object.fromEntries(CATEGORIES.map(c => [c.key, 0])) as Record<CategoryKey, number>;
    for (const inv of inRange.filter(i => month(i.values.issue_date) === m)) values[category(inv)] += invoiceAmount(inv)!;
    for (const k of Object.keys(values) as CategoryKey[]) values[k] = round(values[k]);
    return { month: m, values, total: round(Object.values(values).reduce((a, b) => a + b, 0)) };
  });
  const categories = CATEGORIES.map(c => c.key).filter(k => spend.some(s => s.values[k] !== 0));

  const suppliers = new Map<string, { name: string; spend: number; invoices: number }>();
  for (const inv of inRange) {
    const company = ix.byId.get(ix.issuerOf.get(inv.id) ?? "");
    const key = company?.id ?? "sin-emisor";
    const entry = suppliers.get(key) ?? { name: companyName(company) ?? "Sin emisor identificado", spend: 0, invoices: 0 };
    entry.spend = round(entry.spend + invoiceAmount(inv)!); entry.invoices++;
    suppliers.set(key, entry);
  }

  const products = new Map<string, { name: string; quantity: number; spend: number; lines: number }>();
  for (const line of data.lines) {
    const name = str(line.values.description);
    const amount = num(line.values.line_total_with_tax) ?? num(line.values.line_total);
    const invoice = ix.byId.get(ix.invoiceOfLine.get(line.id) ?? "");
    const m = month(line.values.source_ticket_date) ?? (invoice ? month(invoice.values.issue_date) : null);
    if (!name || amount === null || !m || !months.includes(m)) continue;
    // Product lines only: supply invoices have "concepts" (power, energy…), not products.
    if (invoice && category(invoice) === "suministros") continue;
    const key = name.toLocaleLowerCase("es").replace(/\s+/g, " ");
    const entry = products.get(key) ?? { name, quantity: 0, spend: 0, lines: 0 };
    entry.quantity = round(entry.quantity + (num(line.values.quantity) ?? 0)); entry.spend = round(entry.spend + amount); entry.lines++;
    products.set(key, entry);
  }


  const totalSpend = round(spend.reduce((a, s) => a + s.total, 0));
  const lastMonth = months.at(-1) ?? null;
  return {
    months, spend, categories,
    kpis: { totalSpend, invoices: inRange.length, suppliers: new Set(inRange.map(i => ix.issuerOf.get(i.id)).filter(Boolean)).size,
      monthlyAverage: months.length ? round(totalSpend / months.length) : 0, lastMonth,
      lastMonthSpend: spend.at(-1)?.total ?? 0, previousMonthSpend: spend.at(-2)?.total ?? 0 },
    topSuppliers: [...suppliers.values()].sort((a, b) => b.spend - a.spend).slice(0, 6),
    topProducts: [...products.values()].sort((a, b) => b.spend - a.spend).slice(0, 8),
    electricity: electricityByMonth(data).filter(e => months.includes(e.month)),
    excluded: { withoutDate: received.filter(i => !month(i.values.issue_date)).length,
      withoutAmount: received.filter(i => month(i.values.issue_date) && invoiceAmount(i) === null).length,
      withoutCategory: received.filter(i => !str(i.values.expense_category)).length },
  };
}

// ---------- useful tables (no relation or tax tables) ----------
export type Column = { key: string; label: string; kind?: "money" | "number" | "date" | "text" };
export type Table = { key: string; label: string; description: string; columns: Column[]; rows: Record<string, string | number | null>[] };
export const TABLE_KEYS = ["facturas", "compras", "proveedores", "suministros", "consumos"] as const;

export function buildTable(data: AnalyticsData, key: string): Table {
  const ix = indexes(data);
  const label = (c: string) => CATEGORIES.find(x => x.key === c)?.label ?? c;
  switch (key) {
    case "compras": return { key, label: "Productos comprados", description: "Cada línea de compra con su fecha real (la del ticket cuando la factura agrupa varios).",
      columns: [{ key: "fecha", label: "Fecha", kind: "date" }, { key: "producto", label: "Producto" }, { key: "proveedor", label: "Proveedor" },
        { key: "cantidad", label: "Cantidad", kind: "number" }, { key: "precio", label: "Precio unitario", kind: "money" }, { key: "importe", label: "Importe", kind: "money" }, { key: "factura", label: "Factura" }],
      rows: data.lines.map(l => {
        const inv = ix.byId.get(ix.invoiceOfLine.get(l.id) ?? "");
        return { fecha: str(l.values.source_ticket_date) ?? (inv ? str(inv.values.issue_date) : null), producto: str(l.values.description),
          proveedor: inv ? companyName(ix.byId.get(ix.issuerOf.get(inv.id) ?? "")) : null, cantidad: num(l.values.quantity),
          precio: num(l.values.unit_price_with_tax) ?? num(l.values.unit_price), importe: num(l.values.line_total_with_tax) ?? num(l.values.line_total),
          factura: inv ? str(inv.values.invoice_number) : null, _cat: inv ? category(inv) : null };
      }).filter(r => r._cat !== "suministros").map(({ _cat, ...r }) => r).sort((a, b) => String(b.fecha ?? "").localeCompare(String(a.fecha ?? ""))) };
    case "proveedores": {
      const rows = data.companies.map(c => {
        const invoices = data.relations.invoice_issuer.filter(([company]) => company === c.id).map(([, inv]) => ix.byId.get(inv)).filter((x): x is Row => !!x);
        return { empresa: companyName(c), nif: str(c.values.tax_identifier), facturas: invoices.length,
          gasto: round(invoices.reduce((a, i) => a + (invoiceAmount(i) ?? 0), 0)), ultima: invoices.map(i => str(i.values.issue_date)).filter(Boolean).sort().at(-1) ?? null };
      }).filter(r => r.facturas > 0).sort((a, b) => b.gasto - a.gasto);
      return { key, label: "Proveedores", description: "Empresas que te han facturado, con su gasto total.",
        columns: [{ key: "empresa", label: "Empresa" }, { key: "nif", label: "NIF/CIF" }, { key: "facturas", label: "Facturas", kind: "number" },
          { key: "gasto", label: "Gasto total", kind: "money" }, { key: "ultima", label: "Última factura", kind: "date" }], rows };
    }
    case "suministros": return { key, label: "Suministros", description: "Luz, gas, agua y telecomunicaciones contratados, con lo facturado.",
      columns: [{ key: "tipo", label: "Tipo" }, { key: "identificador", label: "Identificador" }, { key: "tarifa", label: "Tarifa" }, { key: "titular", label: "Titular" },
        { key: "facturas", label: "Facturas", kind: "number" }, { key: "gasto", label: "Facturado", kind: "money" }],
      rows: data.supplies.map(s => {
        const invoices = data.relations.invoice_supply_point.filter(([supply]) => supply === s.id).map(([, inv]) => ix.byId.get(inv)).filter((x): x is Row => !!x);
        return { tipo: str(s.values.supply_type), identificador: str(s.values.supply_point_id), tarifa: str(s.values.tariff),
          titular: companyName(ix.byId.get(ix.holderOfSupply.get(s.id) ?? "")), facturas: invoices.length, gasto: round(invoices.reduce((a, i) => a + (invoiceAmount(i) ?? 0), 0)) };
      }) };
    case "consumos": {
      const electricity = electricityByMonth(data);
      return { key, label: "Consumo eléctrico", description: "kWh facturados por mes (el total impreso de la factura o, si no lo hay, la suma de sus periodos).",
        columns: [{ key: "mes", label: "Mes" }, { key: "kwh", label: "kWh", kind: "number" }], rows: electricity.map(e => ({ mes: MONTH_LABEL(e.month), kwh: e.kwh })) };
    }
    default: return { key: "facturas", label: "Facturas", description: "Todas tus facturas guardadas, con su proveedor y categoría.",
      columns: [{ key: "fecha", label: "Fecha", kind: "date" }, { key: "numero", label: "Número" }, { key: "proveedor", label: "Proveedor" }, { key: "categoria", label: "Categoría" },
        { key: "base", label: "Base", kind: "money" }, { key: "iva", label: "IVA", kind: "money" }, { key: "total", label: "Total", kind: "money" }],
      rows: data.invoices.map(i => ({ fecha: str(i.values.issue_date), numero: str(i.values.invoice_number),
        proveedor: companyName(ix.byId.get(ix.issuerOf.get(i.id) ?? "")), categoria: label(category(i)),
        base: num(i.values.net_amount), iva: num(i.values.tax_amount), total: num(i.values.total_amount) }))
        .sort((a, b) => String(b.fecha ?? "").localeCompare(String(a.fecha ?? ""))) };
  }
}
