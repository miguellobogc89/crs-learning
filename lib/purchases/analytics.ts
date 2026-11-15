import type { AnalyticsData } from "@/lib/analytics/data";
import type { CellValue, Column } from "@/lib/analytics/compute";
import { parseMeasure } from "@/lib/assistant/data/query";
import { normalizeLines, type Line, type Normalized } from "./rules";

/**
 * Purchases as Analítica reads them, normalized (lib/purchases/rules). The only bridge between the workspace's data
 * and the validation: «Productos comprados» adds these columns, and a line that needs the person is flagged with
 * `_attention` (the table shows it in light yellow).
 */
const num = (v: unknown): number | null => typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : null;
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const unitOf = (u: string | null): Line["unidadEnvase"] => !u ? null : /^l/i.test(u) ? "L" : /^k/i.test(u) ? "Kg" : /^u/i.test(u) || u.trim() === "1" ? "ud" : null;
/** A VAT rate as typed in the catalog: 10, "10", "10 %", "10,5" or 0.1 → 10. */
const rateOf = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace("%", "").replace(",", ".").trim()) : NaN;
  if (!Number.isFinite(n) || n < 0) return null;
  return n > 0 && n < 1 ? Math.round(n * 1000) / 10 : n;
};
/** The product's VAT rate from its catalog row (the «iva» column, when the catalog has one). */
export const catalogIva = (row: { values: Record<string, unknown> } | undefined): number | null =>
  row && row.values.iva !== undefined && row.values.iva !== null && row.values.iva !== "" ? rateOf(row.values.iva) : null;

/**
 * The product catalog of the purchases: the table (made with the assistant) that «Productos comprados» links to and
 * that says what each pack holds («envase»). `catalogOf`: purchase line → its catalog row.
 */
export function purchaseCatalog(data: AnalyticsData) {
  const link = (data.links ?? []).find(l => l.from === "compras" && (data.custom ?? []).some(c => `tabla:${c.typeKey}` === l.to && c.campos.some(f => f.key === "envase")));
  const catalog = link ? (data.custom ?? []).find(c => `tabla:${c.typeKey}` === link.to) : undefined;
  return catalog ? { catalog, catalogOf: new Map(link!.pairs), relationId: link!.relationId } : null;
}

/** Every purchase line (not supplies, not income), with the content of one unit from the catalog linked to it (or read from the product name). */
export function purchaseLines(data: AnalyticsData): Line[] {
  const byId = new Map([...data.invoices, ...data.companies].map(r => [r.id, r]));
  const invoiceOf = new Map(data.relations.invoice_lines?.map(([invoice, line]) => [line, invoice]) ?? []);
  const issuerOf = new Map(data.relations.invoice_issuer?.map(([company, invoice]) => [invoice, company]) ?? []);
  const linked = purchaseCatalog(data);
  const catalogRow = new Map((linked?.catalog.rows ?? []).map(r => [r.id, r]));
  const catalogOf = linked?.catalogOf ?? new Map<string, string>();
  // Only purchases: not supplies (they have their own analysis) nor invoices the workspace issued.
  const own = new Set(data.companies.filter(c => c.values.is_own_company === true || c.values.is_own_company === "true").map(c => c.id));
  const isPurchase = (inv: AnalyticsData["invoices"][number] | undefined) => !inv || (str(inv.values.expense_category) !== "suministros"
    && !/emitid|venta|ingreso|issued|sale/.test((str(inv.values.direction) ?? "").toLowerCase()) && !own.has(issuerOf.get(inv.id) ?? ""));
  return data.lines.filter(l => isPurchase(byId.get(invoiceOf.get(l.id) ?? ""))).map(l => {
    const invoiceId = invoiceOf.get(l.id) ?? null;
    const inv = invoiceId ? byId.get(invoiceId) : undefined;
    const company = inv ? byId.get(issuerOf.get(inv.id) ?? "") : undefined;
    const proveedor = company ? str(company.values.legal_name) ?? str(company.values.trade_name) : null;
    const producto = str(l.values.description);
    const c = catalogRow.get(catalogOf.get(l.id) ?? "");
    const fromCatalog = c && num(c.values.envase) && unitOf(str(c.values.unidad)) ? { cantidad: num(c.values.envase)!, unidad: unitOf(str(c.values.unidad))! } : null;
    // Content per pack: the product's catalog row decides (set once there, it applies to all its purchases);
    // without it, as read from the invoice, then from the product name.
    const read = num(l.values.package_content) && unitOf(str(l.values.package_unit)) ? { cantidad: num(l.values.package_content)!, unidad: unitOf(str(l.values.package_unit))! } : null;
    const measure = fromCatalog ?? read ?? parseMeasure(producto);
    const readAsCatalog = !!read && (!fromCatalog || (read.cantidad === fromCatalog.cantidad && read.unidad === fromCatalog.unidad));
    // VAT rate: the catalog's, when the product has one there; else the one read on the invoice.
    const iva = catalogIva(c) ?? num(l.values.tax_rate);
    // Only the amount with VAT was read: without VAT when the price was read without it (so both match); else as read.
    const withTax = num(l.values.line_total_with_tax);
    const withoutTax = withTax !== null && iva !== null && num(l.values.unit_price) !== null ? Math.round(withTax / (1 + iva / 100) * 100) / 100 : withTax;
    const discount = num(l.values.discount_amount);
    return { id: l.id, grupo: `${(proveedor ?? "").toLowerCase()}|${(producto ?? "").toLowerCase().replace(/\s+/g, " ")}`, factura: invoiceId,
      fecha: str(l.values.source_ticket_date) ?? (inv ? str(inv.values.issue_date) : null), proveedor, producto,
      documento: (invoiceId && data.documents?.[invoiceId]?.fileId) || null,
      cantidad: num(l.values.quantity) ?? num(l.values.package_count), descuentoPct: num(l.values.discount_percent), envaseLeido: readAsCatalog, precio: num(l.values.unit_price) ?? num(l.values.unit_price_with_tax), descuento: discount !== null ? Math.abs(discount) : null,
      importe: num(l.values.line_total) ?? withoutTax, iva, unidad: str(l.values.unit),
      // Only when the amount without VAT was read too: then the one with VAT can confirm it.
      importeConIva: num(l.values.line_total) !== null ? num(l.values.line_total_with_tax) : null,
      importeSinIvaLeido: num(l.values.line_total), importeIvaLeido: num(l.values.line_total_with_tax),
      envase: measure?.cantidad ?? null, unidadEnvase: measure?.unidad ?? null };
  });
}

export function normalizePurchases(data: AnalyticsData): { lines: Line[]; normalized: Map<string, Normalized> } {
  const lines = purchaseLines(data);
  return { lines, normalized: normalizeLines(lines) };
}

/** The columns «Productos comprados» adds: what was really bought and what it really cost. */
export const PURCHASE_COLUMNS: Column[] = [
  { key: "tipo", label: "Tipo", filter: true },
  { key: "cantidad_real", label: "Cantidad real", kind: "number" }, { key: "unidad_real", label: "Ud." },
  { key: "descuento_pct", label: "Dto. %", kind: "number" }, { key: "precio_final", label: "Precio final", kind: "money" },
  { key: "ahorro", label: "Ahorro (regalo)", kind: "money" },
  { key: "no_cuadra", label: "No cuadra", filter: true }, { key: "detalle", label: "Detalle" },
];

export function purchaseCells(n: Normalized | undefined): Record<string, CellValue> {
  if (!n) return {};
  return { tipo: n.estado === "regalo" ? "Regalo" : "Compra", cantidad_real: n.cantidad_real, unidad_real: n.unidad_real, descuento_pct: n.descuento_pct,
    precio_final: n.precio_final, ahorro: n.ahorro, no_cuadra: n.estado === "no_cuadra" ? "Sí" : null, detalle: n.nota || null,
    _attention: n.estado === "no_cuadra" ? n.nota : null };
}
