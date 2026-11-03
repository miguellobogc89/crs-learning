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
 * - desde: since when that price holds (first of the latest run of purchases at the same price).
 * - no_cuadran / notas: the purchases that do not add up, by date.
 * - estado: «Revisar» when no purchase gives a price, or when the list price (before discount) moved more than 10 %
 *   from the purchase before; «Regalo» when it only came as a gift; otherwise «OK». A different discount is not a
 *   change of price.
 */
export const LIVE_CATALOG_FIELDS = ["compras", "no_cuadran", "notas", "estado", "precio_envase", "precio_unidad", "desde"] as const;
/** A list price that moves more than this (from one purchase to the next) is flagged. */
export const TARIFF_JUMP = 0.1;

const r = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;
const num = (v: unknown): number | null => typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : null;
const money = (n: number) => n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dmy = (d: string | null) => d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "sin fecha";

export type LiveCatalog = { typeKey: string; values: Map<string, Partial<Record<(typeof LIVE_CATALOG_FIELDS)[number], CellValue>>> };

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
      return [{ fecha: l.fecha, unit, tarifa }];
    }).sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? ""));
    const last = paid.at(-1);
    const out: Partial<Record<(typeof LIVE_CATALOG_FIELDS)[number], CellValue>> = { compras: own.length, no_cuadran: noCuadran.length };
    const notes: string[] = [];
    const gifts = own.length > 0 && own.every(l => n(l.id)?.estado === "regalo");
    let revisar = !last && !gifts && own.length > 0;
    if (last) {
      out.precio_unidad = envase ? r(last.unit, 4) : null;
      out.precio_envase = envase ? r(last.unit * envase, 2) : r(last.unit, last.unit < 1 ? 4 : 2);
      if (paid.length >= 2) {
        let desde = last.fecha;
        for (const p of [...paid].reverse()) { if (Math.abs(p.unit - last.unit) <= 0.005 && p.fecha) desde = p.fecha; else break; }
        out.desde = desde;
        const prev = paid[paid.length - 2];
        const change = prev.tarifa > 0 ? last.tarifa / prev.tarifa - 1 : 0;
        if (Math.abs(change) > TARIFF_JUMP) {
          revisar = true;
          notes.push(`La tarifa ha ${change > 0 ? "subido" : "bajado"} un ${Math.round(Math.abs(change) * 100)} % respecto a la compra del ${dmy(prev.fecha)}: revisar.`);
        }
      } else out.desde = null;
    } else notes.push(gifts ? "Solo se ha recibido como regalo: sin precio." : own.length ? "Ninguna compra tiene cantidad e importe para calcular el precio." : "Sin compras vinculadas.");
    if (noCuadran.length) notes.push(`No cuadran: ${noCuadran.map(l => l.importe !== null ? `${dmy(l.fecha)} (${money(l.importe)} €)` : dmy(l.fecha)).join(", ")}.`);
    else if (paid.length === 1) notes.push("Solo hay 1 compra: precio sin comparar.");
    out.notas = notes.length ? notes.join(" ") : null;
    out.estado = revisar ? "Revisar" : gifts ? "Regalo" : "OK";
    values.set(row.id, out);
  }
  return { typeKey: linked.catalog.typeKey, values };
}
