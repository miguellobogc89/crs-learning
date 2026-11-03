import type { AnalyticsData } from "@/lib/analytics/data";
import { normalizePurchases, purchaseCatalog } from "./analytics";
import { agentDismissed, liveCatalog, tariffJumpId } from "./catalog";

/**
 * The correction agent of the catalog, the purchases and their prices (pure: data in, proposals out).
 *
 * What adds up to the cent is fixed on its own (lib/purchases/cleanup). This is the rest: what needs an owner's
 * decision («propone») or what nobody can work out without the ticket («pregunta»). Each proposal has a stable id:
 * an owner's answer is kept, and the proposal does not come back until something new happens.
 * Nothing here writes: agent.service applies what an owner accepts.
 */
export type AgentAction =
  | { k: "unir"; destino: string; origen: string }          // merge two catalog rows: origen's purchases go to destino
  | { k: "cantidad"; lineId: string; quantity: number; factor: number } // correct a line's quantity (its unit price ÷ factor: the amount stays)
  | { k: "archivar"; productId: string };                    // take a row that is not a product out of the catalog
export type Proposal = {
  id: string;
  kind: "duplicado" | "tarifa" | "cantidad" | "no_producto" | "no_cuadra";
  nivel: "propone" | "pregunta";
  titulo: string;
  detalle: string;
  /** What «Aplicar» does; none: the only answers are «Es correcto» / «Descartar». */
  accion: AgentAction | null;
};

const num = (v: unknown): number | null => typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : null;
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const money = (n: number) => n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dmy = (d: string | null) => d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "sin fecha";
const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** The words of a product name, comparable: no accents or case, a unit glued to a number dropped («57x35mm» → «57x35»). */
export function nameTokens(name: string): string[] {
  return plain(name).split(/[^a-z0-9]+/).filter(Boolean)
    .map(t => /\d/.test(t) ? t.replace(/(mm|cm|cms|cmts|kgs?|grs?|g|lts?|l|ml|cl|uds?|u)$/, "") : t).filter(Boolean);
}
/** Rows that are not products: discounts, parking, carriage, rounding… (they stay in the invoice, out of the catalog). */
const NOT_A_PRODUCT = /\b(parking|aparcamiento|portes?|transporte|redondeo|compra mas paga menos|descuento|dto|abono|recargo)\b/;

/** Words that may differ between two spellings of the same product: units, numbers, codes of one or two letters. */
const UNIT_WORDS = new Set(["cm", "cms", "cmts", "mm", "kg", "kgs", "g", "gr", "grs", "l", "lt", "lts", "ml", "cl", "cc", "u", "ud", "uds", "unid", "unidades"]);
const filler = (t: string) => /^\d+$/.test(t) || t.length <= 2 || UNIT_WORDS.has(t);

const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

export function reviewPurchases(data: AnalyticsData): Proposal[] {
  const linked = purchaseCatalog(data);
  if (!linked) return [];
  const live = liveCatalog(data)!;
  const dismissed = agentDismissed(data, linked.catalog.typeKey);
  const { lines, normalized } = normalizePurchases(data);
  const out: Proposal[] = [];
  const rows = linked.catalog.rows;
  const nameOf = (r: (typeof rows)[number]) => str(r.values.producto) ?? str(r.values[linked.catalog.titulo ?? ""]) ?? "(sin nombre)";
  const purchasesOf = new Map<string, typeof lines>();
  for (const l of lines) { const row = linked.catalogOf.get(l.id); if (row) purchasesOf.set(row, [...(purchasesOf.get(row) ?? []), l]); }
  const manual = (id: string) => new Set(data.manual?.[id] ?? []);

  // 1 · Not a product.
  const notProducts = new Set<string>();
  for (const r of rows) {
    const own = purchasesOf.get(r.id) ?? [];
    const negative = own.length > 0 && own.every(l => (l.importe ?? 0) <= 0 && !l.cantidad);
    if (!NOT_A_PRODUCT.test(plain(nameOf(r))) && !negative) continue;
    notProducts.add(r.id);
    out.push({ id: `noprod:${r.id}`, kind: "no_producto", nivel: "propone", titulo: `«${nameOf(r)}» no parece un producto`,
      detalle: `Parece un descuento, unos portes o un ticket de parking. Se quita del catálogo (se archiva); la línea sigue en su factura.`,
      accion: { k: "archivar", productId: r.id } });
  }

  // 2 · Duplicates: same supplier and the same reference, or one name inside the other that only adds units, numbers or
  //     short codes («6 CMTS.», «01880», «(AL)»); a real word more («SIN») makes it another product.
  const candidates = rows.filter(r => !notProducts.has(r.id));
  const seen = new Set<string>();
  for (let i = 0; i < candidates.length; i++) for (let j = i + 1; j < candidates.length; j++) {
    const a = candidates[i], b = candidates[j];
    const pa = plain(str(a.values.proveedor) ?? ""), pb = plain(str(b.values.proveedor) ?? "");
    if (!pa || pa !== pb || seen.has(a.id) || seen.has(b.id)) continue;
    const ea = num(a.values.envase), eb = num(b.values.envase);
    if (ea !== null && eb !== null && ea !== eb) continue;
    const ra = str(a.values.referencia), rb = str(b.values.referencia);
    const ta = new Set(nameTokens(nameOf(a))), tb = new Set(nameTokens(nameOf(b)));
    const [small, big] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
    const inside = small.size >= 2 && [...small].every(t => big.has(t)) && [...big].filter(t => !small.has(t)).every(filler);
    if (!(ra && rb && plain(ra) === plain(rb)) && !inside) continue;
    // The one with more purchases keeps its name; the other's becomes an alias.
    const [destino, origen] = (purchasesOf.get(a.id)?.length ?? 0) >= (purchasesOf.get(b.id)?.length ?? 0) ? [a, b] : [b, a];
    seen.add(a.id); seen.add(b.id);
    out.push({ id: `dup:${[a.id, b.id].sort().join(":")}`, kind: "duplicado", nivel: "propone", titulo: `«${nameOf(origen)}» y «${nameOf(destino)}» parecen el mismo producto`,
      detalle: `Mismo proveedor (${str(a.values.proveedor)})${ra && rb && plain(ra) === plain(rb) ? ` y misma referencia (${ra})` : ""}. Se unen en «${nameOf(destino)}»: sus ${(purchasesOf.get(origen.id)?.length ?? 0)} compras pasan a él y «${nameOf(origen)}» queda como alias.`,
      accion: { k: "unir", destino: destino.id, origen: origen.id } });
  }

  const quantityRows = new Set<string>();
  // 3 · A quantity that looks misread: what was paid per unit is a whole multiple (×2, ×3…) of what this product usually costs.
  for (const [rowId, own] of purchasesOf) {
    if (notProducts.has(rowId)) continue;
    const paid = own.filter(l => { const n = normalized.get(l.id); return (n?.estado === "ok" || n?.estado === "auto") && l.cantidad && l.importe && l.importe > 0; });
    if (paid.length < 3) continue;
    for (const l of paid) {
      if (manual(l.id).has("quantity")) continue;
      const others = paid.filter(o => o.id !== l.id).map(o => o.importe! / o.cantidad!);
      const ratio = (l.importe! / l.cantidad!) / median(others);
      const k = Math.round(ratio);
      if (k < 2 || Math.abs(ratio - k) > 0.08) continue;
      const quantity = l.cantidad! * k;
      out.push({ id: `cant:${l.id}:${quantity}`, kind: "cantidad", nivel: "propone",
        titulo: `«${l.producto ?? nameOf(rows.find(x => x.id === rowId)!)}» del ${dmy(l.fecha)}: ¿${quantity} en vez de ${l.cantidad}?`,
        detalle: `Se pagaron ${money(l.importe!)} € por ${l.cantidad}; lo habitual de este producto es ${money(median(others))} € cada uno, justo ${k} veces menos.`,
        accion: { k: "cantidad", lineId: l.id, quantity, factor: k } });
      quantityRows.add(rowId);
    }
  }

  // 4 · List price that moved more than 10 % (not while a quantity of that product is in doubt: that comes first).
  for (const [rowId, j] of live.jumps) {
    const r = rows.find(x => x.id === rowId);
    if (!r || notProducts.has(rowId) || quantityRows.has(rowId)) continue;
    const pct = Math.round(Math.abs(j.change) * 100);
    out.push({ id: tariffJumpId(rowId, j.lastLineId), kind: "tarifa", nivel: "propone",
      titulo: `«${nameOf(r)}»: la tarifa ha ${j.change > 0 ? "subido" : "bajado"} un ${pct} %`,
      detalle: `Compra del ${dmy(j.lastFecha)} frente a la del ${dmy(j.prevFecha)}, sin contar descuentos. Si es correcto, confírmalo; si no, corrige esa compra en «Productos comprados».`,
      accion: null });
  }

  // 5 · What nothing explains: the ticket is needed.
  for (const l of lines) {
    const n = normalized.get(l.id);
    if (n?.estado !== "no_cuadra" || notProducts.has(linked.catalogOf.get(l.id) ?? "")) continue;
    out.push({ id: `nocuadra:${l.id}`, kind: "no_cuadra", nivel: "pregunta", titulo: `«${l.producto ?? "Compra"}» del ${dmy(l.fecha)} no cuadra`,
      detalle: `${n.nota} Mira el ticket y corrige la cantidad, el precio o el importe en «Productos comprados».`, accion: null });
  }

  return out.filter(p => !dismissed.has(p.id));
}
