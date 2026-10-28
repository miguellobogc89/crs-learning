import type { AnalyticsData, CustomTable, Row } from "./data";
import { extraCopies } from "@/lib/knowledge/intake/writer/duplicates";

/**
 * Pure analytics over the workspace's records: income and expenses, costs by category, products and prices,
 * electricity, and the "useful tables" (no relation or tax tables). Amounts are the values as stored (decimal
 * strings); nothing is invented: invoices without a usable date or amount are counted apart.
 *
 * Income or expense: an invoice marked "emitida" is income and one marked "recibida" an expense; otherwise it is
 * income when its issuer is one of the workspace's own companies ("Mi empresa"), and an expense in any other case.
 */
export const CATEGORIES = [
  { key: "suministros", label: "Suministros" }, { key: "compras", label: "Compras" }, { key: "servicios", label: "Servicios" },
  { key: "alquiler", label: "Alquiler" }, { key: "personal", label: "Personal" }, { key: "impuestos", label: "Impuestos" },
  { key: "rectificativas", label: "Rectificativas" }, { key: "otros", label: "Otros" },
] as const;
export type CategoryKey = (typeof CATEGORIES)[number]["key"];
export const SUBCATEGORY_LABEL: Record<string, string> = {
  electricidad: "Electricidad", gas: "Gas", agua: "Agua", telecomunicaciones: "Telecomunicaciones", compra_articulos: "Compra de artículos",
  ticket: "Tickets", servicios_profesionales: "Servicios profesionales", alquiler: "Alquiler", rectificativa_abono: "Abonos", sin_subtipo: "Sin detalle",
};

export const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v);
  return null;
};
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const month = (v: unknown) => { const d = str(v); return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.slice(0, 7) : null; };
const round = (n: number) => Math.round(n * 100) / 100;
const truthy = (v: unknown) => v === true || v === "true";

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
  const own = new Set(data.companies.filter(c => truthy(c.values.is_own_company)).map(c => c.id));
  return { byId, issuerOf, customerOf, invoiceOfLine, invoiceOfConsumption, supplyOfInvoice, holderOfSupply, own };
}
type Ix = ReturnType<typeof indexes>;

const companyName = (r: Row | undefined) => r ? str(r.values.legal_name) ?? str(r.values.trade_name) ?? str(r.values.tax_identifier) ?? "Sin nombre" : null;
const invoiceAmount = (inv: Row) => num(inv.values.total_amount) ?? num(inv.values.net_amount);
const category = (inv: Row): CategoryKey => {
  const c = str(inv.values.expense_category);
  return (CATEGORIES.some(x => x.key === c) ? c : "otros") as CategoryKey;
};

/** "emitida"/"recibida" as marked by the person win; otherwise an invoice issued by "Mi empresa" is income. */
export function isIncome(inv: Row, ix: { issuerOf: Map<string, string>; customerOf: Map<string, string>; own: Set<string> }): boolean {
  const direction = str(inv.values.direction)?.toLowerCase() ?? "";
  if (/emitid|venta|ingreso|issued|sale/.test(direction)) return true;
  if (/recibid|compra|gasto|received|purchase/.test(direction)) return false;
  const issuer = ix.issuerOf.get(inv.id), customer = ix.customerOf.get(inv.id);
  // Issued by my company AND addressed to someone else. "From me to me" is a misread issuer (e.g. a utility bill
  // where the holder was taken as issuer): it stays an expense until the person fixes it.
  return !!issuer && ix.own.has(issuer) && !(customer && ix.own.has(customer));
}

// ---------- period ----------
/**
 * Period of the dashboard: the last `monthsBack` months with data (default), or a calendar `year` (January to
 * December; the current year stops at the current month, so future months are not shown as zero).
 */
export type Period = number | { monthsBack?: number; year?: number; today?: Date };

/** Costs from template tables marked "sumar como gasto" (payslips, rent receipts…): one per record with date and amount. */
export function templateCosts(data: AnalyticsData): { month: string; amount: number; category: CategoryKey; templateId: string; label: string }[] {
  return (data.templates ?? []).filter(t => t.analitica.sumar && t.analitica.importe && t.analitica.fecha).flatMap(t => t.rows.flatMap(r => {
    const m = month(r.values[t.analitica.fecha!]), amount = num(r.values[t.analitica.importe!]);
    const category = (CATEGORIES.some(c => c.key === t.analitica.categoria) ? t.analitica.categoria : "otros") as CategoryKey;
    return m && amount !== null ? [{ month: m, amount, category, templateId: t.id, label: t.nombre }] : [];
  }));
}

const datedInvoices = (data: AnalyticsData) => data.invoices.filter(i => month(i.values.issue_date) && invoiceAmount(i) !== null);

/** Years with dated invoices (income or expense), most recent first (the year selector). */
export function availableYears(data: AnalyticsData): number[] {
  return [...new Set(datedInvoices(data).map(i => Number(month(i.values.issue_date)!.slice(0, 4))))].sort((a, b) => b - a);
}

export function periodMonths(data: AnalyticsData, period: Period = 12): string[] {
  const { monthsBack = 12, year, today = new Date() } = typeof period === "number" ? { monthsBack: period } : period;
  const all = datedInvoices(data).map(i => month(i.values.issue_date)!).sort();
  const latest = all.at(-1) ?? null, earliest = all[0] ?? null;
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
  return months;
}

// ---------- costs (also the classic dashboard) ----------
export type Dashboard = {
  months: string[];
  spend: { month: string; values: Record<CategoryKey, number>; total: number }[];
  categories: CategoryKey[];
  kpis: { totalSpend: number; invoices: number; suppliers: number; monthlyAverage: number; lastMonth: string | null; lastMonthSpend: number; previousMonthSpend: number };
  topSuppliers: { name: string; spend: number; invoices: number }[];
  topProducts: { name: string; quantity: number; spend: number; lines: number }[];
  electricity: { month: string; kwh: number }[];
  subcategories: { key: string; label: string; category: CategoryKey; total: number; invoices: number }[];
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
    if (/total/i.test(str(c.values.period) ?? "")) entry.total = (entry.total ?? 0) + kwh; else entry.periods += kwh;
    kwhByMonth.set(m, entry);
  }
  return [...kwhByMonth].map(([m, e]) => ({ month: m, kwh: round(e.total ?? e.periods) })).sort((a, b) => a.month.localeCompare(b.month));
}

type ProductLine = { key: string; name: string; month: string; date: string | null; quantity: number | null; unitPrice: number | null; amount: number; supplier: string | null };

/** Purchase lines that are products (not supply concepts nor sales), with their real date. */
function productLines(data: AnalyticsData, ix: Ix): ProductLine[] {
  const out: ProductLine[] = [];
  for (const line of data.lines) {
    const name = str(line.values.description);
    const amount = num(line.values.line_total_with_tax) ?? num(line.values.line_total);
    const invoice = ix.byId.get(ix.invoiceOfLine.get(line.id) ?? "");
    const date = str(line.values.source_ticket_date) ?? (invoice ? str(invoice.values.issue_date) : null);
    const m = month(date);
    if (!name || amount === null || !m) continue;
    if (invoice && (category(invoice) === "suministros" || isIncome(invoice, ix))) continue;
    out.push({ key: name.toLocaleLowerCase("es").replace(/\s+/g, " "), name, month: m, date, quantity: num(line.values.quantity),
      unitPrice: num(line.values.unit_price_with_tax) ?? num(line.values.unit_price), amount,
      supplier: invoice ? ix.issuerOf.get(invoice.id) ?? null : null });
  }
  return out;
}

export function computeDashboard(data: AnalyticsData, period: Period = 12): Dashboard {
  const ix = indexes(data);
  const months = periodMonths(data, period);
  const expenses = data.invoices.filter(i => !isIncome(i, ix));
  const dated = expenses.filter(i => month(i.values.issue_date) && invoiceAmount(i) !== null);
  const inRange = dated.filter(i => months.includes(month(i.values.issue_date)!));
  const extra = templateCosts(data).filter(c => months.includes(c.month));
  const spend = months.map(m => {
    const values = Object.fromEntries(CATEGORIES.map(c => [c.key, 0])) as Record<CategoryKey, number>;
    for (const inv of inRange.filter(i => month(i.values.issue_date) === m)) values[category(inv)] += invoiceAmount(inv)!;
    for (const c of extra.filter(x => x.month === m)) values[c.category] += c.amount;
    for (const k of Object.keys(values) as CategoryKey[]) values[k] = round(values[k]);
    return { month: m, values, total: round(Object.values(values).reduce((a, b) => a + b, 0)) };
  });
  const categories = CATEGORIES.map(c => c.key).filter(k => spend.some(s => s.values[k] !== 0));

  const suppliers = new Map<string, { name: string; spend: number; invoices: number }>();
  const subcats = new Map<string, { key: string; label: string; category: CategoryKey; total: number; invoices: number }>();
  for (const inv of inRange) {
    const company = ix.byId.get(ix.issuerOf.get(inv.id) ?? "");
    const key = company?.id ?? "sin-emisor";
    const entry = suppliers.get(key) ?? { name: companyName(company) ?? "Sin emisor identificado", spend: 0, invoices: 0 };
    entry.spend = round(entry.spend + invoiceAmount(inv)!); entry.invoices++;
    suppliers.set(key, entry);
    const sub = str(inv.values.expense_subcategory) ?? "sin_subtipo";
    const s = subcats.get(sub) ?? { key: sub, label: SUBCATEGORY_LABEL[sub] ?? sub.replace(/_/g, " "), category: category(inv), total: 0, invoices: 0 };
    s.total = round(s.total + invoiceAmount(inv)!); s.invoices++;
    subcats.set(sub, s);
  }

  for (const c of extra) {
    const s = subcats.get(`plantilla:${c.templateId}`) ?? { key: `plantilla:${c.templateId}`, label: c.label, category: c.category, total: 0, invoices: 0 };
    s.total = round(s.total + c.amount); s.invoices++;
    subcats.set(s.key, s);
  }

  const products = new Map<string, { name: string; quantity: number; spend: number; lines: number }>();
  for (const l of productLines(data, ix).filter(l => months.includes(l.month))) {
    const entry = products.get(l.key) ?? { name: l.name, quantity: 0, spend: 0, lines: 0 };
    entry.quantity = round(entry.quantity + (l.quantity ?? 0)); entry.spend = round(entry.spend + l.amount); entry.lines++;
    products.set(l.key, entry);
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
    subcategories: [...subcats.values()].sort((a, b) => b.total - a.total),
    excluded: { withoutDate: expenses.filter(i => !month(i.values.issue_date)).length,
      withoutAmount: expenses.filter(i => month(i.values.issue_date) && invoiceAmount(i) === null).length,
      withoutCategory: expenses.filter(i => !str(i.values.expense_category)).length },
  };
}

// ---------- overview and income ----------
export type Overview = {
  months: string[];
  perMonth: { month: string; ingresos: number; gastos: number }[];
  totals: { ingresos: number; gastos: number; resultado: number; margen: number | null };
  invoices: { ingresos: number; gastos: number };
  hasOwnCompany: boolean;
};

export function computeOverview(data: AnalyticsData, period: Period = 12): Overview {
  const ix = indexes(data);
  const months = periodMonths(data, period);
  const perMonth = months.map(m => ({ month: m, ingresos: 0, gastos: 0 }));
  const counts = { ingresos: 0, gastos: 0 };
  for (const inv of datedInvoices(data)) {
    const slot = perMonth.find(p => p.month === month(inv.values.issue_date));
    if (!slot) continue;
    const income = isIncome(inv, ix);
    if (income) { slot.ingresos = round(slot.ingresos + invoiceAmount(inv)!); counts.ingresos++; }
    else { slot.gastos = round(slot.gastos + invoiceAmount(inv)!); counts.gastos++; }
  }
  for (const c of templateCosts(data)) {
    const slot = perMonth.find(p => p.month === c.month);
    if (slot) { slot.gastos = round(slot.gastos + c.amount); counts.gastos++; }
  }
  const ingresos = round(perMonth.reduce((a, p) => a + p.ingresos, 0)), gastos = round(perMonth.reduce((a, p) => a + p.gastos, 0));
  return { months, perMonth, totals: { ingresos, gastos, resultado: round(ingresos - gastos), margen: ingresos ? round((ingresos - gastos) / ingresos * 100) : null },
    invoices: counts, hasOwnCompany: ix.own.size > 0 };
}

export type IncomeView = {
  months: string[];
  perMonth: { month: string; total: number }[];
  total: number; invoices: number; averageInvoice: number;
  customers: { name: string; total: number; invoices: number }[];
  recent: { fecha: string | null; cliente: string; numero: string | null; total: number | null; documento: string | null }[];
  hasOwnCompany: boolean;
};

export function computeIncome(data: AnalyticsData, period: Period = 12): IncomeView {
  const ix = indexes(data);
  const months = periodMonths(data, period);
  const income = datedInvoices(data).filter(i => isIncome(i, ix) && months.includes(month(i.values.issue_date)!));
  const perMonth = months.map(m => ({ month: m, total: round(income.filter(i => month(i.values.issue_date) === m).reduce((a, i) => a + invoiceAmount(i)!, 0)) }));
  const customers = new Map<string, { name: string; total: number; invoices: number }>();
  for (const inv of income) {
    const company = ix.byId.get(ix.customerOf.get(inv.id) ?? "");
    const key = company?.id ?? "sin-cliente";
    const entry = customers.get(key) ?? { name: companyName(company) ?? "Cliente sin identificar", total: 0, invoices: 0 };
    entry.total = round(entry.total + invoiceAmount(inv)!); entry.invoices++;
    customers.set(key, entry);
  }
  const total = round(income.reduce((a, i) => a + invoiceAmount(i)!, 0));
  return { months, perMonth, total, invoices: income.length, averageInvoice: income.length ? round(total / income.length) : 0,
    customers: [...customers.values()].sort((a, b) => b.total - a.total),
    recent: [...income].sort((a, b) => String(b.values.issue_date).localeCompare(String(a.values.issue_date))).slice(0, 8).map(i => ({
      fecha: str(i.values.issue_date), cliente: companyName(ix.byId.get(ix.customerOf.get(i.id) ?? "")) ?? "Cliente sin identificar",
      numero: str(i.values.invoice_number), total: invoiceAmount(i), documento: data.documents?.[i.id]?.fileId ?? null })),
    hasOwnCompany: ix.own.size > 0 };
}

// ---------- products ----------
export type ProductsView = {
  months: string[];
  distinct: number; lines: number; spend: number; suppliers: number;
  bySpend: { name: string; spend: number; quantity: number; lines: number }[];
  byQuantity: { name: string; spend: number; quantity: number; lines: number }[];
  /** Products bought at least twice with a unit price: first and last price in the period, and the change. */
  prices: { name: string; first: number; last: number; min: number; max: number; change: number; purchases: number; suppliers: number }[];
  /** Who the products are bought from (product lines only). */
  bySupplier: { name: string; spend: number; products: number }[];
};

export function computeProducts(data: AnalyticsData, period: Period = 12): ProductsView {
  const ix = indexes(data);
  const months = periodMonths(data, period);
  const lines = productLines(data, ix).filter(l => months.includes(l.month));
  const groups = new Map<string, ProductLine[]>();
  for (const l of lines) groups.set(l.key, [...(groups.get(l.key) ?? []), l]);
  const totals = [...groups.values()].map(g => ({ name: g[0].name, spend: round(g.reduce((a, l) => a + l.amount, 0)),
    quantity: round(g.reduce((a, l) => a + (l.quantity ?? 0), 0)), lines: g.length }));
  const prices = [...groups.values()].map(g => {
    const priced = g.filter(l => l.unitPrice !== null && l.unitPrice > 0).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    if (priced.length < 2) return null;
    const values = priced.map(l => l.unitPrice!);
    const first = values[0], last = values.at(-1)!;
    return { name: g[0].name, first, last, min: Math.min(...values), max: Math.max(...values), change: round((last - first) / first * 100),
      purchases: priced.length, suppliers: new Set(g.map(l => l.supplier).filter(Boolean)).size };
  }).filter((x): x is NonNullable<typeof x> => !!x).sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  const supplierTotals = new Map<string, { name: string; spend: number; products: Set<string> }>();
  for (const l of lines) {
    const key = l.supplier ?? "sin-emisor";
    const entry = supplierTotals.get(key) ?? { name: companyName(ix.byId.get(l.supplier ?? "")) ?? "Sin emisor identificado", spend: 0, products: new Set<string>() };
    entry.spend = round(entry.spend + l.amount); entry.products.add(l.key);
    supplierTotals.set(key, entry);
  }
  return { months, distinct: groups.size, lines: lines.length, spend: round(lines.reduce((a, l) => a + l.amount, 0)),
    bySupplier: [...supplierTotals.values()].map(s => ({ name: s.name, spend: s.spend, products: s.products.size })).sort((a, b) => b.spend - a.spend),
    suppliers: new Set(lines.map(l => l.supplier).filter(Boolean)).size,
    bySpend: [...totals].sort((a, b) => b.spend - a.spend), byQuantity: [...totals].sort((a, b) => b.quantity - a.quantity), prices };
}

// ---------- useful tables (no relation or tax tables) ----------
export type CellValue = string | number | boolean | null;
/** `edit`: the cell can be changed from the table (field of the record behind the row, `_id`/`_rev`/`_type`). */
export type Column = { key: string; label: string; kind?: "money" | "number" | "date" | "text" | "document" | "boolean";
  /** Offered as a filter above the table (columns with a few repeated values). */
  filter?: boolean;
  /** Link column: the table its values point to. */
  link?: string;
  edit?: { field: string; type: "text" | "select" | "boolean" | "party"; options?: { value: string; label: string }[] } };
/** `title`: the column that names each row (used to point at rows: links, the assistant). Rows of records carry `_id`. */
export type Table = { key: string; label: string; description: string; columns: Column[]; rows: Record<string, CellValue>[]; title?: string };
export const TABLE_KEYS = ["facturas", "compras", "empresas", "suministros", "consumos"] as const;
/** Edits allowed from Analítica (record type → fields). Anything else is changed in Tablas of the engine. */
export const EDITABLE: Record<string, Record<string, "text" | "boolean" | "direction" | "category">> = {
  company: { legal_name: "text", is_own_company: "boolean" },
  invoice: { direction: "direction", expense_category: "category" },
};

/** Every table of the workspace: the base ones, those made from documents and those created with the assistant. */
export function allTableKeys(data: AnalyticsData): string[] {
  return [...TABLE_KEYS, ...(data.templates ?? []).map(t => `plantilla:${t.id}`), ...(data.custom ?? []).map(t => `tabla:${t.typeKey}`)];
}

/** A table with its link columns (each row shows the name of the row it points to; `_link_<col>` keeps its id). */
export function buildTable(data: AnalyticsData, key: string): Table {
  const table = buildBaseTable(data, key);
  const links = (data.links ?? []).filter(l => l.from === table.key);
  if (!links.length) return table;
  const targets = new Map<string, Map<string, CellValue>>();
  const labelsOf = (to: string) => {
    if (!targets.has(to)) {
      const target = buildBaseTable(data, to);
      targets.set(to, new Map(target.rows.filter(r => typeof r._id === "string").map(r => [r._id as string, target.title ? r[target.title] ?? null : null])));
    }
    return targets.get(to)!;
  };
  const columns = [...table.columns];
  const docAt = columns.findIndex(c => c.kind === "document");
  const linkColumns = links.map(l => ({ key: l.columna, label: l.nombre, filter: true, link: l.to }));
  columns.splice(docAt >= 0 ? docAt : columns.length, 0, ...linkColumns);
  const rows = table.rows.map(r => {
    if (typeof r._id !== "string") return r;
    const out = { ...r };
    for (const l of links) {
      const to = l.pairs.find(([from]) => from === r._id)?.[1] ?? null;
      out[l.columna] = to ? labelsOf(l.to).get(to) ?? null : null;
      out[`_link_${l.columna}`] = to;
    }
    return out;
  });
  return { ...table, columns, rows };
}

function customTable(key: string, t: CustomTable): Table {
  const kind = (f: CustomTable["campos"][number]): Column["kind"] => f.type === "decimal" ? (f.money ? "money" : "number") : f.type === "integer" ? "number"
    : f.type === "date" ? "date" : f.type === "boolean" ? "boolean" : "text";
  const value = (f: CustomTable["campos"][number], v: unknown): CellValue => f.type === "decimal" || f.type === "integer" ? num(v) : f.type === "boolean" ? (v === true ? true : v === false ? false : null) : str(v);
  const title = t.titulo && t.campos.some(f => f.key === t.titulo) ? t.titulo : t.campos.find(f => f.type === "text")?.key;
  return { key, label: t.nombre, description: t.descripcion || "Tabla creada con el asistente.", title,
    columns: t.campos.map(f => ({ key: f.key, label: f.label, kind: kind(f) })),
    rows: t.rows.map(r => ({ _id: r.id, _rev: r.revision ?? null, ...Object.fromEntries(t.campos.map(f => [f.key, value(f, r.values[f.key])])) })) };
}

function buildBaseTable(data: AnalyticsData, key: string): Table {
  const ix = indexes(data);
  const custom = key.startsWith("tabla:") ? data.custom?.find(t => `tabla:${t.typeKey}` === key) : undefined;
  if (custom) return customTable(key, custom);
  const template = key.startsWith("plantilla:") ? data.templates?.find(t => `plantilla:${t.id}` === key) : undefined;
  if (template) {
    const kind = (type: string): Column["kind"] => type === "decimal" ? "number" : type === "integer" ? "number" : type === "date" ? "date" : "text";
    const money = (k: string) => k === template.analitica.importe || /importe|total|bruto|neto|coste|cuota|irpf|base|liquido|líquido|pago/i.test(k);
    return { key, label: template.nombre, description: template.descripcion || "Tabla creada a partir de tus documentos.",
      title: template.campos.find(c => c.type === "text")?.key,
      columns: [...template.campos.map(c => ({ key: c.key, label: c.label, kind: c.type === "decimal" && money(c.key) ? "money" as const : kind(c.type),
        ...(c.key === template.analitica.tercero ? { filter: true } : {}) })), { key: "documento", label: "Documento", kind: "document" as const }],
      rows: template.rows.map((r): Record<string, CellValue> => ({ _id: r.id, _rev: r.revision ?? null, ...Object.fromEntries(template.campos.map(c => [c.key, c.type === "decimal" || c.type === "integer" ? num(r.values[c.key]) : str(r.values[c.key])])),
        documento: data.documents?.[r.id]?.fileId ?? null }))
        .sort((a, b) => template.analitica.fecha ? String(b[template.analitica.fecha] ?? "").localeCompare(String(a[template.analitica.fecha] ?? "")) : 0) };
  }
  const label = (c: string) => CATEGORIES.find(x => x.key === c)?.label ?? c;
  const doc = (invoiceId: string | undefined) => (invoiceId && data.documents?.[invoiceId]?.fileId) || null;
  switch (key) {
    case "compras": return { key, label: "Productos comprados", description: "Cada línea de compra con su fecha real (la del ticket cuando la factura agrupa varios).", title: "producto",
      columns: [{ key: "fecha", label: "Fecha", kind: "date" }, { key: "producto", label: "Producto" }, { key: "proveedor", label: "Proveedor", filter: true },
        { key: "cantidad", label: "Cantidad", kind: "number" }, { key: "precio", label: "Precio unitario", kind: "money" }, { key: "importe", label: "Importe", kind: "money" },
        { key: "factura", label: "Factura" }, { key: "documento", label: "Documento", kind: "document" }],
      rows: data.lines.map(l => {
        const inv = ix.byId.get(ix.invoiceOfLine.get(l.id) ?? "");
        return { _id: l.id, fecha: str(l.values.source_ticket_date) ?? (inv ? str(inv.values.issue_date) : null), producto: str(l.values.description),
          proveedor: inv ? companyName(ix.byId.get(ix.issuerOf.get(inv.id) ?? "")) : null, cantidad: num(l.values.quantity),
          precio: num(l.values.unit_price_with_tax) ?? num(l.values.unit_price), importe: num(l.values.line_total_with_tax) ?? num(l.values.line_total),
          factura: inv ? str(inv.values.invoice_number) : null, documento: doc(inv?.id),
          _skip: inv ? category(inv) === "suministros" || isIncome(inv, ix) : false };
      }).filter(r => !r._skip).map(({ _skip, ...r }) => r).sort((a, b) => String(b.fecha ?? "").localeCompare(String(a.fecha ?? ""))) };
    case "proveedores":
    case "empresas": {
      const rows = data.companies.map(c => {
        const issued = data.relations.invoice_issuer.filter(([company]) => company === c.id).map(([, inv]) => ix.byId.get(inv)).filter((x): x is Row => !!x);
        const received = data.relations.invoice_customer.filter(([company]) => company === c.id).map(([, inv]) => ix.byId.get(inv)).filter((x): x is Row => !!x);
        const gasto = issued.filter(i => !isIncome(i, ix)), venta = received.filter(i => isIncome(i, ix));
        return { _id: c.id, _rev: c.revision ?? null, _type: "company", empresa: companyName(c), nif: str(c.values.tax_identifier), mia: truthy(c.values.is_own_company),
          facturas: issued.length + received.length, gasto: round(gasto.reduce((a, i) => a + (invoiceAmount(i) ?? 0), 0)),
          ingreso: round(venta.reduce((a, i) => a + (invoiceAmount(i) ?? 0), 0)),
          ultima: [...issued, ...received].map(i => str(i.values.issue_date)).filter(Boolean).sort().at(-1) ?? null };
      }).sort((a, b) => Number(b.mia) - Number(a.mia) || (b.gasto + b.ingreso) - (a.gasto + a.ingreso));
      return { key: "empresas", label: "Empresas", title: "empresa", description: "Proveedores, clientes y tu propia empresa. Marca «Mi empresa» en la tuya: lo que facture contará como ingreso. El nombre se puede corregir.",
        columns: [{ key: "empresa", label: "Empresa", edit: { field: "legal_name", type: "text" } }, { key: "nif", label: "NIF/CIF" },
          { key: "mia", label: "Mi empresa", kind: "boolean", filter: true, edit: { field: "is_own_company", type: "boolean" } },
          { key: "facturas", label: "Facturas", kind: "number" }, { key: "gasto", label: "Le has comprado", kind: "money" },
          { key: "ingreso", label: "Le has vendido", kind: "money" }, { key: "ultima", label: "Última factura", kind: "date" }], rows };
    }
    case "suministros": return { key, label: "Suministros", description: "Luz, gas, agua y telecomunicaciones contratados, con lo facturado.", title: "identificador",
      columns: [{ key: "tipo", label: "Tipo", filter: true }, { key: "identificador", label: "Identificador" }, { key: "tarifa", label: "Tarifa" }, { key: "titular", label: "Titular" },
        { key: "facturas", label: "Facturas", kind: "number" }, { key: "gasto", label: "Facturado", kind: "money" }],
      rows: data.supplies.map(s => {
        const invoices = data.relations.invoice_supply_point.filter(([supply]) => supply === s.id).map(([, inv]) => ix.byId.get(inv)).filter((x): x is Row => !!x);
        return { _id: s.id, tipo: str(s.values.supply_type), identificador: str(s.values.supply_point_id), tarifa: str(s.values.tariff),
          titular: companyName(ix.byId.get(ix.holderOfSupply.get(s.id) ?? "")), facturas: invoices.length, gasto: round(invoices.reduce((a, i) => a + (invoiceAmount(i) ?? 0), 0)) };
      }) };
    case "consumos": {
      const electricity = electricityByMonth(data);
      return { key, label: "Consumo eléctrico", description: "kWh facturados por mes (el total impreso de la factura o, si no lo hay, la suma de sus periodos).",
        columns: [{ key: "mes", label: "Mes" }, { key: "kwh", label: "kWh", kind: "number" }], rows: electricity.map(e => ({ mes: MONTH_LABEL(e.month), kwh: e.kwh })) };
    }
    default: return { key: "facturas", label: "Facturas", title: "numero", description: "Todas tus facturas guardadas. «Tipo» dice si es un gasto o un ingreso: cámbialo si no es correcto.",
      columns: [{ key: "fecha", label: "Fecha", kind: "date" }, { key: "numero", label: "Número" }, { key: "emisor", label: "Emisor", filter: true, edit: { field: "issuer", type: "party" } }, { key: "receptor", label: "Receptor", filter: true, edit: { field: "customer", type: "party" } },
        { key: "tipo", label: "Tipo", filter: true, edit: { field: "direction", type: "select", options: [{ value: "recibida", label: "Gasto" }, { value: "emitida", label: "Ingreso" }] } },
        { key: "categoria", label: "Categoría", filter: true, edit: { field: "expense_category", type: "select", options: CATEGORIES.map(c => ({ value: c.key, label: c.label })) } },
        { key: "base", label: "Base", kind: "money" }, { key: "iva", label: "IVA", kind: "money" }, { key: "total", label: "Total", kind: "money" },
        { key: "documento", label: "Documento", kind: "document" }],
      rows: data.invoices.map(i => ({ _id: i.id, _rev: i.revision ?? null, _type: "invoice", _issuer: ix.issuerOf.get(i.id) ?? null, _customer: ix.customerOf.get(i.id) ?? null, fecha: str(i.values.issue_date), numero: str(i.values.invoice_number),
        emisor: companyName(ix.byId.get(ix.issuerOf.get(i.id) ?? "")), receptor: companyName(ix.byId.get(ix.customerOf.get(i.id) ?? "")),
        tipo: isIncome(i, ix) ? "Ingreso" : "Gasto", categoria: label(category(i)),
        base: num(i.values.net_amount), iva: num(i.values.tax_amount), total: num(i.values.total_amount), documento: doc(i.id) }))
        .sort((a, b) => String(b.fecha ?? "").localeCompare(String(a.fecha ?? ""))) };
  }
}

// ---------- review ----------
export type DuplicatedLines = { invoiceId: string; numero: string | null; emisor: string | null; fecha: string | null; base: number; sumaLineas: number; quitar: string[] };

/** Saved invoices whose lines were read twice (they add up to twice the net amount, every line in pairs). */
export function duplicatedLineIssues(data: AnalyticsData): DuplicatedLines[] {
  const ix = indexes(data);
  const byInvoice = new Map<string, Row[]>();
  for (const l of data.lines) { const inv = ix.invoiceOfLine.get(l.id); if (inv) byInvoice.set(inv, [...(byInvoice.get(inv) ?? []), l]); }
  const out: DuplicatedLines[] = [];
  for (const inv of data.invoices) {
    const lines = byInvoice.get(inv.id) ?? [];
    const net = num(inv.values.net_amount);
    const amount = (l: Row) => num(l.values.line_total);
    const key = (l: Row) => JSON.stringify([str(l.values.description), str(l.values.quantity), str(l.values.unit_price), str(l.values.line_total), str(l.values.source_ticket_number)]);
    const quitar = extraCopies(lines.map(l => ({ id: l.id, key: key(l), amount: amount(l) })), net);
    if (quitar.length) out.push({ invoiceId: inv.id, numero: str(inv.values.invoice_number), emisor: companyName(ix.byId.get(ix.issuerOf.get(inv.id) ?? "")),
      fecha: str(inv.values.issue_date), base: net!, sumaLineas: round(lines.reduce((a, l) => a + (amount(l) ?? 0), 0)), quitar });
  }
  return out.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
}

/** Companies to choose from when correcting an invoice's issuer or customer. */
export function companyOptions(data: AnalyticsData): { id: string; nombre: string; nif: string | null }[] {
  return data.companies.map(c => ({ id: c.id, nombre: companyName(c) ?? "Sin nombre", nif: str(c.values.tax_identifier) }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}
