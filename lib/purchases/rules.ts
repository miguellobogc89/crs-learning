/**
 * Purchase lines, normalized (pure, testable). Everything about validating purchases lives in lib/purchases.
 *
 * An invoice line must add up on its own: cantidad × precio − descuento = importe. When it does not, it is almost
 * always the import that did not understand the invoice (the discount is a %, the amount has VAT, the quantity counts
 * packs and the price is per kilo…). If an explanation makes it add up to the cent, the line is fixed AUTOMATICALLY —
 * nothing is asked. Free units (no amount) are marked as gifts. Missing figures that follow from the others are
 * filled in. What no explanation fits is left as read and flagged («no_cuadra»).
 * What was read from the invoice is never changed: these are figures computed on top of it.
 */
export type Line = {
  id: string;
  /** Same product from the same supplier (to learn how its price is expressed). */
  grupo: string;
  factura: string | null;
  fecha: string | null;
  proveedor: string | null;
  producto: string | null;
  documento: string | null;
  cantidad: number | null;
  precio: number | null;
  descuento: number | null;
  /** Discount % as read from the invoice (when the reader told it apart from a discount in euros). */
  descuentoPct?: number | null;
  importe: number | null;
  /** VAT % (10 when unknown). */
  iva: number | null;
  /** Unit printed on the invoice (kg, l, ud…). */
  unidad: string | null;
  /** Content of one unit bought (catalog, or read from the name) and its unit. */
  envase: number | null;
  unidadEnvase: "L" | "Kg" | "ud" | null;
  /** The content per pack was read from the invoice (its column or the name), not guessed. */
  envaseLeido?: boolean;
};


export type State =
  | "ok"          // adds up as read
  | "auto"        // fixed automatically (an explanation makes it add up to the cent)
  | "regalo"      // free units
  | "no_cuadra";  // nothing explains it: left as read, flagged

export type Normalized = {
  estado: State;
  /** For «auto»: which explanation made it add up (what a cleanup can write back into the line). */
  caso?: Hit["kind"];
  unidades: number | null;
  cantidad_real: number | null;
  unidad_real: "L" | "Kg" | "ud" | null;
  descuento_pct: number | null;
  precio_final: number | null;
  ahorro: number | null;
  /** What was done, in plain words. */
  nota: string;
};

const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;
const money = (n: number) => n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = (n: number) => n.toLocaleString("es-ES", { maximumFractionDigits: 3 });
const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.02, Math.abs(b) * 0.005);
const isMeasureUnit = (u: string | null) => !!u && /^(l|lt|lts|litros?|kg|kgs|kilos?)\.?$/i.test(u.trim());
const median = (v: number[]) => { if (!v.length) return null; const s = [...v].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

export type Hit = { kind: "cuadra" | "pct" | "iva" | "envases" | "precio_envase" | "contenido" | "cantidad"; pct: number | null; unidades: number; base: "medida" | "envase" | null };
const WHY: Record<Hit["kind"], string> = {
  cuadra: "", pct: "el descuento es un porcentaje", iva: "el importe lleva IVA",
  envases: "la cantidad son envases y el precio va por kilo o litro", precio_envase: "la cantidad va en kilos o litros y el precio por envase",
  contenido: "se leyó como cantidad lo que trae cada envase; el importe indica cuántos envases son",
  cantidad: "la cantidad se leyó mal: el importe indica otra",
};

/** The explanation that makes the line add up, if any (most plausible first). */
function explain(l: { cantidad: number; precio: number; importe: number; descuento: number | null; descuentoPct?: number | null; iva: number | null; envase: number | null }, typicalPrice: number | null): Hit | null {
  const { cantidad: q, precio: p, importe: t } = l;
  const iva = l.iva ?? 10, e = l.envase;
  // A discount % read as such is used as a %; otherwise a small «discount» may be a % saved as euros.
  const read = l.descuentoPct !== null && l.descuentoPct !== undefined && l.descuentoPct > 0 && l.descuentoPct < 100 ? l.descuentoPct : null;
  const d = read !== null ? 0 : l.descuento ?? 0;
  const pct = read ?? (l.descuento !== null && l.descuento > 0 && l.descuento < 100 ? l.descuento : null);
  // A price printed with 2 decimals is rounded: on big quantities (2.000 tarrinas a 0,09 €) that is several euros.
  const rounded = Math.abs(p * 100 - Math.round(p * 100)) < 1e-9 ? q * 0.005 : 0;
  const asRead = (calc: number, k: number | null) => Math.abs(calc - t) <= Math.max(0.02, Math.abs(t) * 0.005, rounded * (1 - (k ?? 0) / 100));
  // As read (discount in euros, or a %): the closer of the two when both are within the rounding.
  const plain = q * p - d, withPct = pct !== null ? q * p * (1 - pct / 100) : null;
  const okPlain = asRead(plain, null), okPct = withPct !== null && asRead(withPct, pct);
  if (okPlain && (!okPct || Math.abs(plain - t) <= Math.abs(withPct! - t))) return { kind: "cuadra", pct: null, unidades: q, base: null };
  if (okPct) return { kind: "pct", pct, unidades: q, base: null };
  const tries: [Hit["kind"], number | null, number | null, number | null, Hit["base"]][] = [
    ["iva", (q * p - d) * (1 + iva / 100), null, q, null],
    ["iva", pct !== null ? q * p * (1 - pct / 100) * (1 + iva / 100) : null, pct, q, null],
    ["envases", e ? q * e * p - d : null, null, q, "medida"],
    ["envases", e && pct !== null ? q * e * p * (1 - pct / 100) : null, pct, q, "medida"],
    ["precio_envase", e ? (q / e) * p - d : null, null, e ? q / e : null, "envase"],
    ["precio_envase", e && pct !== null ? (q / e) * p * (1 - pct / 100) : null, pct, e ? q / e : null, "envase"],
  ];
  // What each pack holds was read as the quantity («1,25» for «B/1,25 KGS»): the amount says how many packs.
  if (e && Math.abs(q - e) < 1e-6) {
    for (const k of [pct, null]) {
      const n = t / (e * p * (1 - (k ?? 0) / 100));
      if (n >= 1 && Math.abs(n - Math.round(n)) < 0.01) tries.push(["contenido", Math.round(n) * e * p * (1 - (k ?? 0) / 100), k, Math.round(n), "medida"]);
    }
  }
  // Last: the amount is quantity × price, ignoring a discount that was printed (least likely).
  tries.push(["cuadra", q * p, null, q, null]);
  for (const [kind, calc, pctUsed, unidades, base] of tries) if (calc !== null && unidades !== null && Number.isFinite(calc) && near(calc, t)) return { kind, pct: pctUsed, unidades, base };
  // The quantity was misread: the amount is a whole number of units at the usual price of this product. Only when the
  // price read is that usual price (otherwise it could be the price that is wrong): then it is safe to fix.
  if (typicalPrice !== null && Math.abs(p - typicalPrice) <= typicalPrice * 0.02) {
    for (const k of [pct, null]) {
      const n = t / (p * (1 - (k ?? 0) / 100));
      if (n >= 1 && Math.abs(n - Math.round(n)) < 0.01 && Math.round(n) !== q) return { kind: "cantidad", pct: k, unidades: Math.round(n), base: null };
    }
  }
  return null;
}

/** Normalizes every line at once (a product priced per kilo on one line is read that way on all of them). */
export function normalizeLines(lines: Line[]): Map<string, Normalized> {
  // The usual unit price of each product: what the lines that add up as read were charged.
  const okPrices = new Map<string, number[]>();
  for (const l of lines) if (l.cantidad && l.precio && l.importe && near(l.cantidad * l.precio - (l.descuento ?? 0), l.importe)) okPrices.set(l.grupo, [...(okPrices.get(l.grupo) ?? []), l.precio]);
  const typical = new Map([...okPrices].map(([g, v]) => [g, median(v)]));
  const hits = new Map<string, Hit | null>();
  const perMeasure = new Set<string>();
  for (const l of lines) {
    const h = l.cantidad && l.precio && l.importe ? explain({ ...l, cantidad: l.cantidad, precio: l.precio, importe: l.importe }, typical.get(l.grupo) ?? null) : null;
    hits.set(l.id, h);
    if (h?.base === "medida" || isMeasureUnit(l.unidad)) perMeasure.add(l.grupo);
  }
  // What one unit usually costs (to value free units): same invoice first, then any purchase of the product.
  const paid = new Map<string, number[]>();
  for (const l of lines) if (l.cantidad && l.importe && l.importe > 0) for (const k of [`${l.factura}|${l.grupo}`, l.grupo]) paid.set(k, [...(paid.get(k) ?? []), l.importe / l.cantidad]);

  const out = new Map<string, Normalized>();
  for (const l of lines) {
    const ref = median(paid.get(`${l.factura}|${l.grupo}`) ?? []) ?? median(paid.get(l.grupo) ?? []);
    out.set(l.id, one(l, hits.get(l.id) ?? null, perMeasure.has(l.grupo), ref));
  }
  return out;
}

function one(l: Line, hit: Hit | null, perMeasure: boolean, ref: number | null): Normalized {
  const blank = { unidades: null, cantidad_real: null, unidad_real: null, descuento_pct: null, precio_final: null, ahorro: null };
  const content = l.envase && l.unidadEnvase ? { e: l.envase, u: l.unidadEnvase } : null;
  // Free units: a quantity and nothing charged.
  if (l.cantidad && l.cantidad > 0 && (l.importe === 0 || (l.importe === null && !l.precio))) {
    const ahorro = ref !== null ? round(l.cantidad * ref, 2) : null;
    return { ...blank, estado: "regalo", unidades: l.cantidad, cantidad_real: content ? round(l.cantidad * content.e) : null, unidad_real: content?.u ?? null, ahorro,
      nota: ahorro !== null ? `Regalo: ${qty(l.cantidad)} sin cobrar, valorado en ${money(ahorro)} €.` : "Regalo: sin cobrar." };
  }
  // Missing figures that follow from the others are filled in; with two missing, the line is flagged.
  let { cantidad: q, precio: p, importe: t } = l;
  const filled: string[] = [];
  if (t === null && q && p) { const pct = l.descuentoPct ?? (l.descuento && l.descuento < 100 ? l.descuento : null); t = round(pct ? q * p * (1 - pct / 100) : q * p - (l.descuento ?? 0), 2); filled.push("el importe"); }
  else if (q === null && t && p) { const n = t / p; if (Math.abs(n - Math.round(n)) < 0.01 && n >= 1) { q = Math.round(n); filled.push("la cantidad"); } }
  else if (p === null && q && t) { p = t / q; filled.push("el precio"); }
  if (!q || t === null) return { ...blank, estado: "no_cuadra",
    nota: `No se pudo leer ${[!q && "la cantidad", t === null && "el importe"].filter(Boolean).join(" ni ")}.` };
  if (filled.length && !hit && p) hit = { kind: "cuadra", pct: null, unidades: q, base: null };

  if (!hit) return { ...blank, estado: "no_cuadra", unidades: q,
    nota: `No cuadra: ${qty(q)} × ${money(p ?? 0)} €${l.descuento ? ` − ${money(l.descuento)}` : ""} no da ${money(t)} €.` };
  const unidades = hit.unidades;
  let cantidad_real: number | null = null, unidad_real: Normalized["unidad_real"] = null;
  if (content) {
    unidad_real = content.u;
    // Packs × content; or the quantity already is kilos/litres (price per pack read per kilo, or a product priced per kilo).
    // A count of units that is a whole number of boxes of units («2.000» of «CJ/2000 U.») already is the units.
    const inUnits = content.u === "ud" && hit.kind !== "envases" && hit.kind !== "contenido" && unidades >= content.e && Math.abs(unidades / content.e - Math.round(unidades / content.e)) < 1e-9;
    cantidad_real = hit.kind === "precio_envase" || inUnits ? round(hit.kind === "precio_envase" ? q : unidades)
      : perMeasure && hit.kind !== "envases" && hit.kind !== "contenido" ? round(unidades) : round(unidades * content.e);
  }
  const descuento_pct = hit.pct ?? (hit.kind === "cuadra" && l.descuento && q && p ? round((1 - t / (q * p)) * 100, 2) : null);
  const precio_final = cantidad_real ? round(t / cantidad_real) : unidades ? round(t / unidades) : null;
  const unit = unidad_real && unidad_real !== "ud" ? `/${unidad_real}` : "/ud";
  // What the invoice says (a discount % or a content per pack read as such) is not a correction.
  const asRead = hit.kind === "cuadra" || (hit.kind === "pct" && !!l.descuentoPct) || (hit.kind === "envases" && !!l.envaseLeido);
  const parts = [
    asRead ? "" : `Corregido automáticamente: ${WHY[hit.kind]}.`,
    filled.length ? `Calculado ${filled.join(" y ")} con las otras cifras.` : "",
    hit.kind === "cantidad" ? `Se leyó ${qty(q)}; son ${qty(unidades)}.` : "",
    precio_final !== null && (hit.kind !== "cuadra" || cantidad_real) ? `Precio final ${money(precio_final)} €${unit}${descuento_pct ? ` (con ${money(descuento_pct)} % de descuento)` : ""}.` : "",
  ].filter(Boolean);
  return { estado: asRead && !filled.length ? "ok" : "auto", caso: hit.kind, unidades, cantidad_real, unidad_real, descuento_pct, precio_final, ahorro: null, nota: parts.join(" ") };
}

export function summarize(n: Map<string, Normalized>) {
  const count: Record<State, number> = { ok: 0, auto: 0, regalo: 0, no_cuadra: 0 };
  for (const x of n.values()) count[x.estado] += 1;
  return { total: n.size, ...count };
}
