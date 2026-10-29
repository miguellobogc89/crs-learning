/**
 * Review of purchase lines (pure, testable). Each line must add up on its own:
 *
 *   cantidad × precio − descuento = importe
 *
 * When it does not, the usual explanations are tried in order (the discount is a % saved as euros, the amount includes
 * VAT, the quantity counts packs while the price is per kilo/litre, …). A line explained this way gets a correction
 * («corregible»); a line with no amount and a quantity is a free unit («regalo»); a line no explanation fits is a
 * «duda» to ask the person about. Nothing is written here: accepted reviews are stored apart (purchase_line_reviews),
 * never over what was read from the invoice.
 */
export type ReviewCase =
  | "cuadra" | "descuento_pct" | "con_iva" | "envases" | "precio_por_envase" | "cantidad_mal_leida"
  | "regalo" | "faltan_datos" | "duda";
export type ReviewState = "ok" | "corregible" | "regalo" | "faltan" | "duda" | "revisada";

export type ReviewLine = {
  id: string;
  /** Lines of the same product from the same supplier share this key (to learn how its price is expressed). */
  grupo: string;
  factura: string | null;
  producto: string | null;
  cantidad: number | null;
  precio: number | null;
  descuento: number | null;
  importe: number | null;
  /** VAT % of the line (10 when unknown). */
  iva: number | null;
  /** «kg», «l», «ud»… as printed on the invoice. */
  unidad: string | null;
  /** Content of one unit of purchase (from the catalog, or read from the name) and its unit. */
  envase: number | null;
  unidadEnvase: "L" | "Kg" | "ud" | null;
};

export type Review = {
  caso: ReviewCase;
  estado: ReviewState;
  /** Units bought (packs, boxes…), corrected when the invoice was misread. */
  unidades: number | null;
  /** Total litres / kilos (or units) actually bought. */
  cantidad_real: number | null;
  unidad_real: "L" | "Kg" | "ud" | null;
  /** List price per unit of measure (per L/Kg when known; otherwise per unit bought). */
  precio_tarifa: number | null;
  descuento_pct: number | null;
  /** What it really costs per L/Kg (or per unit bought when the content is unknown), discount included. */
  precio_final: number | null;
  /** Free units: what they would have cost. */
  ahorro: number | null;
  nota: string;
};

/** A review the person accepted or wrote (stored apart from the invoice line). */
export type StoredReview = Partial<Review> & { estado: "revisada"; caso: ReviewCase; nota: string; por?: string; en?: string };

export const CASE_LABEL: Record<ReviewCase, string> = {
  cuadra: "Cuadra",
  descuento_pct: "El descuento es un % (se guardó como euros)",
  con_iva: "El importe lleva IVA",
  envases: "La cantidad son envases: hay que multiplicar por su contenido",
  precio_por_envase: "La cantidad va en kilos/litros y el precio por envase",
  cantidad_mal_leida: "La cantidad se leyó mal (el importe indica otra)",
  regalo: "Unidades de regalo",
  faltan_datos: "Faltan datos (cantidad, precio o importe)",
  duda: "No cuadra: hay que preguntar",
};
export const STATE_LABEL: Record<ReviewState, string> = {
  ok: "OK", corregible: "Corrección propuesta", regalo: "Regalo", faltan: "Faltan datos", duda: "Duda", revisada: "Revisada",
};

const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;
const money = (n: number) => n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.02, Math.abs(b) * 0.005);
const isMeasureUnit = (u: string | null) => !!u && /^(l|lt|lts|litros?|kg|kgs|kilos?)\.?$/i.test(u.trim());

type Hit = { caso: ReviewCase; pct: number | null; base: "envase" | "medida" | null; unidades: number | null };

/** The first explanation that makes the line add up (same order as the diagnosis). */
function explain(l: ReviewLine): Hit | null {
  const { cantidad: q, precio: p, importe: t } = l;
  const d = l.descuento ?? 0, iva = l.iva ?? 10, e = l.envase;
  if (q === null || p === null || t === null) return null;
  const pct = l.descuento !== null && l.descuento > 0 && l.descuento < 100 ? l.descuento : null;
  const tries: [ReviewCase, number | null, Hit["base"], number | null, number | null][] = [
    ["cuadra", q * p - d, null, null, q],
    ["cuadra", q * p, null, null, q],
    ["descuento_pct", pct !== null ? q * p * (1 - pct / 100) : null, null, pct, q],
    ["con_iva", (q * p - d) * (1 + iva / 100), null, null, q],
    ["con_iva", pct !== null ? q * p * (1 - pct / 100) * (1 + iva / 100) : null, null, pct, q],
    ["envases", e ? q * e * p - d : null, "medida", null, q],
    ["envases", e && pct !== null ? q * e * p * (1 - pct / 100) : null, "medida", pct, q],
    ["precio_por_envase", e ? (q / e) * p - d : null, "envase", null, e ? q / e : null],
    ["precio_por_envase", e && pct !== null ? (q / e) * p * (1 - pct / 100) : null, "envase", pct, e ? q / e : null],
  ];
  for (const [caso, calc, base, pctUsed, unidades] of tries) {
    if (calc !== null && Number.isFinite(calc) && near(calc, t)) return { caso, pct: pctUsed, base, unidades };
  }
  // The amount comes from a whole number of units different from the one read: the quantity was misread.
  for (const k of [pct, null]) {
    const unit = p * (1 - (k ?? 0) / 100);
    if (unit <= 0) continue;
    const n = t / unit;
    if (n >= 1 && Math.abs(n - Math.round(n)) < 0.01 && Math.round(n) !== q) return { caso: "cantidad_mal_leida", pct: k, base: null, unidades: Math.round(n) };
  }
  return null;
}

/**
 * Reviews all the lines at once: a product whose price is per kilo/litre on one line (because its quantity had to be
 * multiplied by the content) is read the same way on the others.
 */
export function reviewLines(lines: ReviewLine[], stored: Record<string, StoredReview> = {}): Map<string, Review> {
  const hits = new Map(lines.map(l => [l.id, explain(l)]));
  const perMeasure = new Set<string>();
  for (const l of lines) {
    const h = hits.get(l.id);
    if (h?.base === "medida" || isMeasureUnit(l.unidad)) perMeasure.add(l.grupo);
  }
  // Reference price of each product (what one unit bought usually costs), for free units.
  const paid = new Map<string, number[]>();
  for (const l of lines) {
    if (l.cantidad && l.importe && l.importe > 0) paid.set(`${l.factura}|${l.grupo}`, [...(paid.get(`${l.factura}|${l.grupo}`) ?? []), l.importe / l.cantidad]);
    if (l.cantidad && l.importe && l.importe > 0) paid.set(l.grupo, [...(paid.get(l.grupo) ?? []), l.importe / l.cantidad]);
  }
  const median = (v: number[] | undefined) => { if (!v?.length) return null; const s = [...v].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

  const out = new Map<string, Review>();
  for (const l of lines) {
    const saved = stored[l.id];
    if (saved) { out.set(l.id, { unidades: null, cantidad_real: null, unidad_real: null, precio_tarifa: null, descuento_pct: null, precio_final: null, ahorro: null, ...saved }); continue; }
    out.set(l.id, reviewOne(l, hits.get(l.id) ?? null, perMeasure.has(l.grupo), median(paid.get(`${l.factura}|${l.grupo}`)) ?? median(paid.get(l.grupo))));
  }
  return out;
}

function reviewOne(l: ReviewLine, hit: Hit | null, perMeasure: boolean, refPrice: number | null): Review {
  const empty = { unidades: null, cantidad_real: null, unidad_real: null, precio_tarifa: null, descuento_pct: null, precio_final: null, ahorro: null };
  const content = l.envase && l.unidadEnvase ? { e: l.envase, u: l.unidadEnvase } : null;
  // Free units: a quantity and no amount (or a zero price).
  if (l.cantidad && l.cantidad > 0 && (l.importe === 0 || (l.importe === null && (l.precio === null || l.precio === 0)))) {
    const ahorro = refPrice !== null ? round(l.cantidad * refPrice, 2) : null;
    return { ...empty, caso: "regalo", estado: "regalo", unidades: l.cantidad,
      cantidad_real: content ? round(l.cantidad * content.e) : null, unidad_real: content?.u ?? null, precio_tarifa: refPrice !== null ? round(refPrice) : null, ahorro,
      nota: ahorro !== null ? `Regalo: ${money(l.cantidad)} sin cobrar, valorado en ${money(ahorro)} €.` : "Regalo: sin cobrar (no hay otra compra para valorarlo)." };
  }
  if (!hit) {
    const missing = l.cantidad === null || l.precio === null || l.importe === null;
    return { ...empty, caso: missing ? "faltan_datos" : "duda", estado: missing ? "faltan" : "duda",
      nota: missing ? `Falta ${[l.cantidad === null && "la cantidad", l.precio === null && "el precio", l.importe === null && "el importe"].filter(Boolean).join(", ")}.`
        : `No cuadra: ${money(l.cantidad!)} × ${money(l.precio!)}${l.descuento ? ` − ${money(l.descuento)}` : ""} no da ${money(l.importe!)}.` };
  }
  const t = l.importe!;
  // How many units were bought, and how much measure: with the price per kilo/litre, the quantity read may already be
  // kilos (a line of this product had to be multiplied by the content) — then the quantity is the measure.
  const unidades = hit.unidades;
  let cantidad_real: number | null = null;
  let unidad_real: Review["unidad_real"] = null;
  if (hit.caso === "envases" && content) { cantidad_real = round(unidades! * content.e); unidad_real = content.u; }
  else if (hit.caso === "precio_por_envase" && content) { cantidad_real = round(l.cantidad!); unidad_real = content.u; }
  else if (perMeasure && content) { cantidad_real = round(unidades!); unidad_real = content.u; }
  else if (content) { cantidad_real = round(unidades! * content.e); unidad_real = content.u; }
  const pct = hit.pct ?? (l.cantidad && l.precio && hit.caso === "cuadra" && l.descuento ? round((1 - t / (l.cantidad * l.precio)) * 100, 2) : null);
  const precio_tarifa = l.precio !== null ? round(hit.caso === "precio_por_envase" && content ? l.precio / content.e : perMeasure || hit.caso === "envases" || !content ? l.precio : l.precio / content.e) : null;
  const precio_final = cantidad_real ? round(t / cantidad_real) : unidades ? round(t / unidades) : null;
  const unitText = unidad_real && unidad_real !== "ud" ? `/${unidad_real}` : "";
  const detail = precio_final !== null ? ` Precio final: ${money(precio_final)} €${unitText}${pct ? ` (tarifa ${money(precio_tarifa ?? 0)} € con ${money(pct)} % de descuento)` : ""}.` : "";
  const correction = hit.caso === "cantidad_mal_leida" ? `Cantidad leída ${money(l.cantidad ?? 0)}; según el importe son ${money(unidades ?? 0)}.`
    : hit.caso === "cuadra" ? "Cuadra." : `${CASE_LABEL[hit.caso]}.`;
  return { caso: hit.caso, estado: hit.caso === "cuadra" ? "ok" : "corregible", unidades, cantidad_real, unidad_real, precio_tarifa, descuento_pct: pct, precio_final, ahorro: null,
    nota: `${correction}${detail}` };
}

/** Counts by state and case, for the assistant and the chat banner. */
export function summarize(reviews: Map<string, Review>) {
  const porEstado: Record<ReviewState, number> = { ok: 0, corregible: 0, regalo: 0, faltan: 0, duda: 0, revisada: 0 };
  const porCaso: Partial<Record<ReviewCase, number>> = {};
  for (const r of reviews.values()) { porEstado[r.estado] += 1; porCaso[r.caso] = (porCaso[r.caso] ?? 0) + 1; }
  return { total: reviews.size, porEstado, porCaso };
}
