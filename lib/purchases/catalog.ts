import type { AnalyticsData } from "@/lib/analytics/data";
import type { CellValue } from "@/lib/analytics/compute";
import { normalizePurchases, purchaseCatalog } from "./analytics";

/**
 * The columns of the product catalog that summarize its purchases, computed LIVE from «Productos comprados» (pure).
 * Stored, they went stale as soon as a purchase was corrected or a new invoice came in; computed, they always agree.
 * Only these columns: the product's own data (name, supplier, pack, unit…) is the person's and is never touched.
 *
 * - compras: purchase lines linked to the product (gifts included).
 * - precio_envase / precio_unidad: what the LAST purchase that adds up really cost (discounts in), per pack and per
 *   kilo, litre or unit. Gifts and lines that do not add up never set a price.
 * - precio_tarifa: the list price of that same purchase, per pack, before the discount and without VAT: the price
 *   that identifies the product and the one compared between purchases.
 * - desde: since when that price holds (first of the latest run of purchases at the same price).
 * - no_cuadran / notas: the purchases that do not add up, by date.
 * - estado: «Revisar» when no purchase gives a price, or when the list price (before discount) moved more than 10 %
 *   from the purchase before; «Regalo» when it only came as a gift; otherwise «OK». A different discount is not a
 *   change of price.
 * - dto_pct / ultima_factura: the discount of the purchase that sets the price, and the document of the latest purchase.
 * - aviso: every warning of the product, one word each (joined with « · »), to filter the catalog by kind of warning.
 * The catalog shows these even when the table has no field for them (they are not stored: see LIVE_CATALOG_LABELS).
 * `history`: every purchase of each product, newest first, to open under its row.
 */
export const LIVE_CATALOG_FIELDS = ["compras", "no_cuadran", "notas", "estado", "precio_envase", "precio_unidad", "precio_tarifa", "desde", "dto_pct", "ultima_factura", "aviso"] as const;
/** How the live columns are titled when the catalog table has no field of its own for them. */
export const LIVE_CATALOG_LABELS: Record<(typeof LIVE_CATALOG_FIELDS)[number], { label: string; kind?: "money" | "number" | "document" }> = {
  compras: { label: "Compras", kind: "number" }, no_cuadran: { label: "No cuadran", kind: "number" }, notas: { label: "Notas" }, estado: { label: "Estado" },
  precio_envase: { label: "Precio envase", kind: "money" }, precio_unidad: { label: "Precio Kg/L/ud", kind: "money" },
  precio_tarifa: { label: "Precio sin dto.", kind: "money" }, desde: { label: "Desde" },
  dto_pct: { label: "Dto. %", kind: "number" }, ultima_factura: { label: "Factura", kind: "document" }, aviso: { label: "Aviso" },
};
/** The kinds of warning of the «aviso» column, in the order they are listed. */
export const CATALOG_WARNINGS = ["Subida de tarifa", "No cuadra", "Sin precio", "Por completar", "Solo regalo", "Solo 1 compra", "Sin compras"] as const;
/** A list price that moves more than this (from one purchase to the next) is flagged. */
export const TARIFF_JUMP = 0.1;

const r = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;
const num = (v: unknown): number | null => typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : null;
const money = (n: number) => n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dmy = (d: string | null) => d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "sin fecha";

/** A list price that moved more than TARIFF_JUMP between the last two purchases that add up. */
export type TariffJump = { change: number; prevFecha: string | null; lastFecha: string | null; lastLineId: string };
/** One purchase of a product, as it opens under its catalog row. Amounts without VAT unless said. */
export type PurchaseHistoryRow = { id: string; fecha: string | null; cantidad: number | null; unidad: string | null;
  /** List price of one unit bought (before discount), as read. */
  precio: number | null; dto_pct: number | null;
  /** What one unit bought really cost: amount without VAT ÷ units (discounts in). */
  precio_ud: number | null; importe: number | null; importe_iva: number | null;
  tipo: "Compra" | "Regalo" | "No cuadra"; factura: string | null; documento: string | null;
  /** Its price per unit differs from the purchase before it (gifts aside). */
  cambio: boolean };
export type LiveCatalog = { typeKey: string; values: Map<string, Partial<Record<(typeof LIVE_CATALOG_FIELDS)[number], CellValue>>>; jumps: Map<string, TariffJump>;
  history: Map<string, PurchaseHistoryRow[]> };

/** The id of a tariff jump in the correction agent (a newer purchase makes it a new one). */
export const tariffJumpId = (rowId: string, lastLineId: string) => `tarifa:${rowId}:${lastLineId}`;

/** What an owner already answered in the correction agent (kept in the catalog table's settings). */
export function agentDismissed(data: AnalyticsData, typeKey: string): Set<string> {
  const settings = (data.types ?? []).find(t => t.tableKey === `tabla:${typeKey}`)?.settings as { agente?: { descartadas?: unknown } } | undefined;
  const list = settings?.agente?.descartadas;
  return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : []);
}

export function liveCatalog(data: AnalyticsData): LiveCatalog | null {
  const linked = purchaseCatalog(data);
  if (!linked) return null;
  const { lines, normalized } = normalizePurchases(data);
  const byRow = new Map<string, typeof lines>();
  for (const l of lines) {
    const row = linked.catalogOf.get(l.id);
    if (row) byRow.set(row, [...(byRow.get(row) ?? []), l]);
  }
  const values: LiveCatalog["values"] = new Map();
  const jumps: LiveCatalog["jumps"] = new Map();
  const history: LiveCatalog["history"] = new Map();
  const invoiceNumber = new Map(data.invoices.map(i => [i.id, typeof i.values.invoice_number === "string" && i.values.invoice_number.trim() ? i.values.invoice_number.trim() : null]));
  const dismissed = agentDismissed(data, linked.catalog.typeKey);
  for (const row of linked.catalog.rows) {
    const own = byRow.get(row.id) ?? [];
    const envase = num(row.values.envase);
    const n = (id: string) => normalized.get(id);
    const noCuadran = own.filter(l => n(l.id)?.estado === "no_cuadra").sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""));
    // What each paid purchase really cost per kilo, litre or unit (unrounded), and its list price before the discount.
    const paid = own.flatMap(l => {
      const x = n(l.id);
      if (!x || (x.estado !== "ok" && x.estado !== "auto") || x.precio_final === null) return [];
      const base = x.cantidad_real || x.unidades, importe = x.importe_corregido ?? l.importe;
      const unit = importe !== null && base ? importe / base : x.precio_final;
      const tarifa = x.descuento_pct && x.descuento_pct < 100 ? unit / (1 - x.descuento_pct / 100) : unit;
      return [{ id: l.id, fecha: l.fecha, unit, tarifa }];
    }).sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? ""));
    const last = paid.at(-1);
    const out: Partial<Record<(typeof LIVE_CATALOG_FIELDS)[number], CellValue>> = { compras: own.length, no_cuadran: noCuadran.length };
    const notes: string[] = [];
    const gifts = own.length > 0 && own.every(l => n(l.id)?.estado === "regalo");
    let revisar = !last && !gifts && own.length > 0;
    if (last) {
      out.precio_unidad = envase ? r(last.unit, 4) : null;
      out.precio_envase = envase ? r(last.unit * envase, 2) : r(last.unit, last.unit < 1 ? 4 : 2);
      const tarifa = envase ? last.tarifa * envase : last.tarifa;
      out.precio_tarifa = r(tarifa, tarifa < 1 ? 4 : 2);
      if (paid.length >= 2) {
        let desde = last.fecha;
        for (const p of [...paid].reverse()) { if (Math.abs(p.unit - last.unit) <= 0.005 && p.fecha) desde = p.fecha; else break; }
        out.desde = desde;
        const prev = paid[paid.length - 2];
        const change = prev.tarifa > 0 ? last.tarifa / prev.tarifa - 1 : 0;
        // An owner who confirmed the new price in the correction agent has answered it: no longer «Revisar».
        if (Math.abs(change) > TARIFF_JUMP && !dismissed.has(tariffJumpId(row.id, last.id))) {
          revisar = true;
          jumps.set(row.id, { change, prevFecha: prev.fecha, lastFecha: last.fecha, lastLineId: last.id });
          notes.push(`La tarifa ha ${change > 0 ? "subido" : "bajado"} un ${Math.round(Math.abs(change) * 100)} % respecto a la compra del ${dmy(prev.fecha)}: revisar.`);
        }
      } else out.desde = null;
    } else notes.push(gifts ? "Solo se ha recibido como regalo: sin precio." : own.length ? "Ninguna compra tiene cantidad e importe para calcular el precio." : "Sin compras vinculadas.");
    if (noCuadran.length) notes.push(`No cuadran: ${noCuadran.map(l => l.importe !== null ? `${dmy(l.fecha)} (${money(l.importe)} €)` : dmy(l.fecha)).join(", ")}.`);
    else if (paid.length === 1) notes.push("Solo hay 1 compra: precio sin comparar.");
    out.notas = notes.length ? notes.join(" ") : null;
    out.estado = revisar ? "Revisar" : gifts ? "Regalo" : "OK";
    out.dto_pct = last ? n(last.id)?.descuento_pct ?? null : null;
    const byDate = [...own].sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""));
    out.ultima_factura = (last && own.find(l => l.id === last.id)?.documento) || byDate.find(l => l.documento)?.documento || null;
    const avisos: string[] = [];
    if (jumps.has(row.id)) avisos.push("Subida de tarifa");
    if (noCuadran.length) avisos.push("No cuadra");
    if (!last && !gifts && own.length > 0) avisos.push("Sin precio");
    if (num(row.values.envase) === null || !(typeof row.values.unidad === "string" && row.values.unidad.trim())) avisos.push("Por completar");
    if (gifts) avisos.push("Solo regalo");
    if (paid.length === 1) avisos.push("Solo 1 compra");
    if (!own.length) avisos.push("Sin compras");
    out.aviso = avisos.length ? avisos.join(" · ") : "OK";
    values.set(row.id, out);
    history.set(row.id, purchaseHistory(own, normalized, invoiceNumber));
  }
  return { typeKey: linked.catalog.typeKey, values, jumps, history };
}

/** Every purchase of one product, newest first, with what each unit really cost and where its price changed. */
function purchaseHistory(own: ReturnType<typeof normalizePurchases>["lines"], normalized: ReturnType<typeof normalizePurchases>["normalized"],
  invoiceNumber: Map<string, string | null>): PurchaseHistoryRow[] {
  const rows = [...own].sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? "")).map((l): PurchaseHistoryRow => {
    const x = normalized.get(l.id);
    const iva = l.iva;
    const sinIva = x?.importe_corregido ?? l.importeSinIvaLeido ?? (l.importeIvaLeido != null && iva != null ? r(l.importeIvaLeido / (1 + iva / 100), 2) : null);
    const conIva = l.importeIvaLeido ?? (sinIva !== null && iva != null ? r(sinIva * (1 + iva / 100), 2) : null);
    const units = x?.unidades ?? l.cantidad;
    const tipo = x?.estado === "regalo" ? "Regalo" : x?.estado === "no_cuadra" ? "No cuadra" : "Compra";
    return { id: l.id, fecha: l.fecha, cantidad: l.cantidad, unidad: l.unidad, precio: l.precio, dto_pct: x?.descuento_pct ?? l.descuentoPct ?? null,
      precio_ud: tipo === "Regalo" ? 0 : sinIva !== null && units ? r(sinIva / units, 4) : null, importe: sinIva, importe_iva: conIva, tipo,
      factura: l.factura ? invoiceNumber.get(l.factura) ?? null : null, documento: l.documento, cambio: false };
  });
  let prev: number | null = null;
  for (const h of rows) {
    if (h.tipo !== "Compra" || h.precio_ud === null) continue;
    if (prev !== null && Math.abs(h.precio_ud - prev) > Math.max(0.005, prev * 0.005)) h.cambio = true;
    prev = h.precio_ud;
  }
  return rows.reverse();
}
