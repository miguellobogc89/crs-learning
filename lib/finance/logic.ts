// lib/finance/logic.ts
// Cálculos de CRS Finance, puros y deterministas (sin base de datos ni IA), para que todo lo que muestra la
// app y lo que responde el copiloto salga de aquí y sea verificable. Fechas siempre como "AAAA-MM-DD".
import { categoryOf, type Kind } from "./categories";

export type Tx = {
  id: string;
  accountId: string;
  date: string;
  amount: number;
  description: string;
  counterparty: string | null;
  counterpartyIbanHash: string | null;
  category: string;
  kind: Kind;
  source: string;
  extraordinary: boolean;
  transferPairId: string | null;
};

// ---------------------------------------------------------------------------------------------------------
// Fechas y ciclo económico (por defecto del 25 al 24)
// ---------------------------------------------------------------------------------------------------------
const DAY = 86_400_000;
export const toDate = (s: string) => new Date(`${s}T00:00:00Z`);
export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (s: string, n: number) => iso(new Date(toDate(s).getTime() + n * DAY));
export const daysBetween = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / DAY);
export const todayIso = (now = new Date()) => {
  // Día natural en Madrid (la app es para España): evita que de 0 a 1-2 h cuente como el día anterior.
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return parts;
};

export type Cycle = { start: string; end: string; label: string };

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/**
 * Cómo empieza cada ciclo. Un número es un día fijo del mes (1 = mes natural). Con `adjust`, si ese día cae en
 * fin de semana o festivo nacional se adelanta al laborable anterior (así se cobra la nómina en España), y
 * `paydays` («AAAA-MM» → fecha) fija el inicio real cuando ya se sabe el día en que entró la nómina.
 */
export type CycleRule = number | { day: number; adjust?: boolean; paydays?: Record<string, string> };

const easterSunday = (y: number) => {
  // Algoritmo de Meeus/Jones/Butcher (calendario gregoriano).
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(y, month - 1, day);
};

/** Festivos nacionales de España (los fijos y el Viernes Santo). */
export function isSpanishHoliday(date: string) {
  const md = date.slice(5);
  if (["01-01", "01-06", "05-01", "08-15", "10-12", "11-01", "12-06", "12-08", "12-25"].includes(md)) return true;
  return iso(new Date(easterSunday(Number(date.slice(0, 4))) - 2 * DAY)) === date;
}

export const isBusinessDay = (date: string) => {
  const wd = toDate(date).getUTCDay();
  return wd !== 0 && wd !== 6 && !isSpanishHoliday(date);
};

const ruleOf = (r: CycleRule) => (typeof r === "number" ? { day: r, adjust: false, paydays: {} as Record<string, string> } : { day: r.day, adjust: r.adjust ?? false, paydays: r.paydays ?? {} });

/** Primer día del ciclo que corresponde al mes `m` (0-11, puede salirse de rango) del año `y`. */
function cycleStart(y: number, m: number, r: ReturnType<typeof ruleOf>) {
  const base = new Date(Date.UTC(y, m, 1));
  const key = iso(base).slice(0, 7);
  if (r.paydays[key]) return r.paydays[key];
  const last = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  let d = iso(new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), Math.min(r.day, last))));
  if (r.adjust && r.day > 1) while (!isBusinessDay(d)) d = addDays(d, -1);
  return d;
}

/** Ciclo que contiene `date` según la regla de inicio. `offset` -1 = el anterior. */
export function cycleFor(date: string, rule: CycleRule, offset = 0): Cycle {
  const r = ruleOf(rule);
  const d = toDate(date);
  const y = d.getUTCFullYear();
  let m = d.getUTCMonth();
  if (date < cycleStart(y, m, r)) m -= 1;
  m += offset;
  const start = cycleStart(y, m, r);
  const end = addDays(cycleStart(y, m + 1, r), -1);
  const s = toDate(start), e = toDate(end);
  const label = r.day === 1 && !r.adjust
    ? `${MONTHS[s.getUTCMonth()]} ${s.getUTCFullYear()}`
    : `${s.getUTCDate()} ${MONTHS[s.getUTCMonth()]} – ${e.getUTCDate()} ${MONTHS[e.getUTCMonth()]}`;
  return { start, end, label };
}

/** Día real de cobro de cada mes: la nómina que entra cerca del día de inicio (como mucho una semana antes). */
export function paydaysFrom(txs: { date: string; kind: string; category: string; amount: number }[], day: number) {
  const out: Record<string, string> = {};
  if (day <= 1) return out;
  for (const t of txs) {
    if (t.kind !== "ingreso" || t.category !== "nomina" || t.amount <= 0) continue;
    const dom = Number(t.date.slice(8, 10));
    if (dom < day - 7 || dom > day + 1) continue;
    const key = t.date.slice(0, 7);
    if (!out[key] || t.date < out[key]) out[key] = t.date;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// Periodo elegido en pantalla (se guarda por persona): unidad, rango y cuentas ocultas
// ---------------------------------------------------------------------------------------------------------
export const PERIOD_UNITS = ["ciclo", "mes"] as const;
export const PERIOD_RANGES = ["actual", "anterior", "3", "6", "12", "anio", "todo", "custom"] as const;
export type PeriodUnit = (typeof PERIOD_UNITS)[number];
export type PeriodRange = (typeof PERIOD_RANGES)[number];
export type ViewPref = { unit: PeriodUnit; range: PeriodRange; from: string | null; to: string | null; hiddenAccounts: string[] };
export const DEFAULT_VIEW: ViewPref = { unit: "ciclo", range: "actual", from: null, to: null, hiddenAccounts: [] };

const isIsoDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Normaliza lo guardado (o lo que llega del navegador) a un periodo válido. */
export function cleanView(v: unknown): ViewPref {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const unit = PERIOD_UNITS.includes(o.unit as PeriodUnit) ? (o.unit as PeriodUnit) : DEFAULT_VIEW.unit;
  let range = PERIOD_RANGES.includes(o.range as PeriodRange) ? (o.range as PeriodRange) : DEFAULT_VIEW.range;
  let from = isIsoDate(o.from) ? o.from : null;
  let to = isIsoDate(o.to) ? o.to : null;
  if (range === "custom" && (!from || !to)) range = DEFAULT_VIEW.range;
  if (from && to && from > to) [from, to] = [to, from];
  const hiddenAccounts = Array.isArray(o.hiddenAccounts) ? o.hiddenAccounts.filter((x): x is string => typeof x === "string").slice(0, 50) : [];
  return { unit, range, from: range === "custom" ? from : null, to: range === "custom" ? to : null, hiddenAccounts };
}

export type ResolvedPeriod = { from: string; to: string; label: string; unit: PeriodUnit; buckets: Cycle[] };

/** Fechas y tramos (ciclos o meses) del periodo elegido. Los tramos del extremo se recortan al rango. */
export function resolvePeriod(v: ViewPref, today: string, rule: CycleRule, oldest: string | null): ResolvedPeriod {
  const r: CycleRule = v.unit === "mes" ? 1 : rule;
  const noun = v.unit === "mes" ? ["mes", "meses"] : ["ciclo", "ciclos"];
  const between = (a: string, b: string) => {
    const out: Cycle[] = [];
    let c = cycleFor(a, r);
    while (c.start <= b && out.length < 400) {
      out.push(c);
      c = cycleFor(c.end, r, 1);
    }
    return out;
  };
  let buckets: Cycle[];
  let label: string;
  if (v.range === "actual" || v.range === "anterior") {
    const c = cycleFor(today, r, v.range === "actual" ? 0 : -1);
    buckets = [c];
    label = `${v.range === "actual" ? `Este ${noun[0]}` : `${noun[0][0].toUpperCase()}${noun[0].slice(1)} anterior`} · ${c.label}`;
  } else if (v.range === "3" || v.range === "6" || v.range === "12") {
    const n = Number(v.range);
    buckets = Array.from({ length: n }, (_, i) => cycleFor(today, r, i - n + 1));
    label = `Últimos ${n} ${noun[1]}`;
  } else if (v.range === "anio") {
    buckets = between(`${today.slice(0, 4)}-01-01`, today);
    label = `Año ${today.slice(0, 4)}`;
  } else if (v.range === "todo") {
    buckets = between(oldest && oldest < today ? oldest : today, today);
    label = "Todo el historial";
  } else {
    const from = v.from!, to = v.to!;
    buckets = between(from, to).map((c) => ({ ...c, start: c.start < from ? from : c.start, end: c.end > to ? to : c.end }));
    label = `${from.split("-").reverse().join("/")} – ${to.split("-").reverse().join("/")}`;
  }
  return { from: buckets[0].start, to: buckets[buckets.length - 1].end, label, unit: v.unit, buckets };
}

export const inCycle = (t: { date: string }, c: Cycle) => t.date >= c.start && t.date <= c.end;

// ---------------------------------------------------------------------------------------------------------
// Texto: normalizar conceptos y sacar la «clave de comercio» (la usan reglas, recurrentes y duplicados)
// ---------------------------------------------------------------------------------------------------------
export function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ*.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const NOISE = [
  /\b(compra|pago|cargo|recibo|adeudo|abono|domiciliacion|operacion)\b/g,
  /\b(con\s+)?tarj(eta)?\.?\b/g,
  /\b(movil|contactless|apple pay|google pay|internet|en|de|del|la|el|a|favor|tpv|ref|referencia|fecha|num|n)\b/g,
  /\b\d{1,2}[./-]\d{1,2}([./-]\d{2,4})?\b/g, // fechas
  /\*+\d*/g, // tarjetas enmascaradas
  /\b\d{3,}\b/g, // números largos (referencias, tarjetas)
  /\b(es|eur|esp|spain|madrid|barcelona)\b/g,
];

/** Clave estable del comercio o contraparte: «COMPRA TARJ. 1234 MERCADONA S.A. 12/11» → «mercadona s.a.». */
export function merchantKey(description: string, counterparty?: string | null) {
  const base = counterparty && counterparty.trim().length > 2 ? counterparty : description;
  let s = normalize(base);
  for (const re of NOISE) s = s.replace(re, " ");
  const words = s
    .split(" ")
    .map((w) => w.replace(/^[.*]+|[.*]+$/g, ""))
    .filter((w) => w.length > 1 && !/\d{3,}/.test(w) && !/^\d+$/.test(w));
  return words.slice(0, 4).join(" ").slice(0, 60) || normalize(description).slice(0, 40);
}

/** Texto donde buscan las reglas y las palabras clave. */
export const searchText = (t: { description: string; counterparty: string | null }) =>
  normalize(`${t.description} ${t.counterparty ?? ""}`);

// ---------------------------------------------------------------------------------------------------------
// Clasificación por palabras clave (antes de la IA): comercios españoles habituales
// ---------------------------------------------------------------------------------------------------------
type Keyword = { re: RegExp; category: string; kind?: Kind; sign?: "in" | "out" };
const KEYWORDS: Keyword[] = [
  // Ahorro e inversión: brókeres, exchanges y fondos (salida = aportación).
  { re: /\b(bitvavo|trading ?212|binance|coinbase|bitget|kraken|myinvestor|indexa|finizens|degiro|interactive brokers|scalable|trade republic|inbestme|renta 4|cuenta de inversion|to investment account|from investment account)\b/, category: "ahorro_inversion", kind: "ahorro" },
  { re: /\b(nomina|salario|sueldo|suel|salar|payroll|haberes)\b/, category: "nomina", kind: "ingreso", sign: "in" },
  { re: /\b(intereses|interes|remuneracion cuenta|dividendo)\b/, category: "intereses", kind: "ingreso", sign: "in" },
  { re: /\b(devolucion|reembolso|refund|return|abono compra|anulacion)\b/, category: "otros_gastos", kind: "devolucion", sign: "in" },
  // Bizum recibido en Revolut: lo mandan amigos (su parte de una cena, un regalo…); no es una recarga propia.
  { re: /\bdinero anadido a traves de bizum\b/, category: "otros_gastos", kind: "devolucion", sign: "in" },
  { re: /\b(traspaso|transferencia entre cuentas|recarga revolut|top ?up|topup|money added|added via|investment account|savings account|vault|pocket|hucha)\b/, category: "transferencia_interna", kind: "interna" },
  { re: /\b(hipoteca|prestamo hipotecario|alquiler|comunidad de propietarios|comunidad prop)\b/, category: "vivienda" },
  { re: /\b(iberdrola|endesa|naturgy|holaluz|totalenergies|repsol luz|canal de isabel|aguas|emasesa|aqualia|movistar|vodafone|orange|digi|jazztel|pepephone|masmovil|yoigo|lowi|simyo|o2|finetwork)\b/, category: "suministros" },
  { re: /\b(mercadona|carrefour|lidl|dia|alcampo|eroski|consum|aldi|hipercor|supercor|caprabo|bonpreu|ahorramas|gadis|froiz|el arbol|supermercado|fruteria|carniceria|panaderia|bm supermercados|masymas|spar|coviran)\b/, category: "alimentacion" },
  { re: /\b(glovo|just eat|uber ?eats|deliveroo|restaurante|rest\.?|bar|cafeteria|cafe|mcdonald|burger king|telepizza|domino|starbucks|kfc|vips|goiko|100 montaditos|tgb|taberna|cerveceria|pizzeria|sushi)\b/, category: "restaurantes" },
  { re: /\b(netflix|spotify|hbo|max\.com|disney|prime video|amazon prime|apple\.com|itunes|icloud|youtube|google one|google storage|chatgpt|openai|anthropic|claude|dazn|filmin|movistar plus|audible|patreon|github|notion|adobe|microsoft 365|xbox|playstation|nintendo)\b/, category: "suscripciones" },
  { re: /\b(renfe|cabify|uber|bolt|freenow|metro|emt|tmb|alsa|blablacar|repsol|cepsa|bp|galp|shell|ballenoil|petroprix|plenoil|gasolinera|parking|aparcamiento|autopista|peaje|via t|itv|taller)\b/, category: "transporte" },
  { re: /\b(ryanair|vueling|iberia|easyjet|air europa|booking|airbnb|expedia|hotel|edreams|skyscanner)\b/, category: "viajes" },
  { re: /\b(amazon|amzn|aliexpress|zara|el corte ingles|decathlon|ikea|mediamarkt|media markt|pccomponentes|shein|primark|leroy merlin|fnac|temu|vinted|wallapop|pull bear|bershka|mango)\b/, category: "compras" },
  { re: /\b(cine|cinesa|yelmo|teatro|ticketmaster|entradas|steam|concierto|gimnasio|basic fit|dreamfit|mcfit|padel)\b/, category: "ocio" },
  { re: /\b(farmacia|clinica|dentista|hospital|sanitas|adeslas|asisa|dkv|optica|fisioterapia|medico)\b/, category: "salud" },
  { re: /\b(seguro|mapfre|mutua madrilena|axa|allianz|linea directa|generali|reale|zurich|verti)\b/, category: "seguros" },
  { re: /\b(prestamo|cuota prestamo|financiacion|cofidis|cetelem|klarna|aplazame|sequra)\b/, category: "prestamos" },
  { re: /\b(aeat|agencia tributaria|hacienda|ibi|ayuntamiento|dgt|tasa|impuesto|seguridad social|tgss)\b/, category: "impuestos" },
  { re: /\b(peluqueria|barberia|estetica|perfumeria|druni|primor|sephora)\b/, category: "cuidado_personal" },
  { re: /\b(academia|universidad|colegio|udemy|coursera|libreria|matricula)\b/, category: "educacion" },
  { re: /\b(cajero|retirada efectivo|reintegro|disposicion efectivo|atm)\b/, category: "efectivo" },
  { re: /\b(comision|comisiones|cuota mantenimiento|cuota tarjeta)\b/, category: "comisiones" },
];

export type Classification = { category: string; kind: Kind; source: "regla" | "interna" | "palabra" | "auto"; extraordinary?: boolean; ruleId?: string };

export type Rule = { id: string; pattern: string; category: string; kind: Kind; extraordinary: boolean };

/** Regla del usuario que encaja (la de patrón más largo, la más concreta). */
export function matchRule(t: { description: string; counterparty: string | null }, rules: Rule[]) {
  const text = searchText(t);
  let best: Rule | null = null;
  for (const r of rules) if (r.pattern && text.includes(r.pattern) && (!best || r.pattern.length > best.pattern.length)) best = r;
  return best;
}

/** Palabras clave: categoría y significado si el concepto es claro. */
export function keywordClass(t: { description: string; counterparty: string | null; amount: number }): Classification | null {
  const text = searchText(t);
  for (const k of KEYWORDS) {
    if (!k.re.test(text)) continue;
    if (k.sign === "in" && t.amount <= 0) continue;
    if (k.sign === "out" && t.amount >= 0) continue;
    // Una entrada con nombre de comercio o de empresa no es necesariamente una devolución (la nómina de
    // Endesa no es «suministros»): se deja a la IA, salvo que el propio concepto diga que es un reembolso.
    if (!k.kind && t.amount > 0) return null;
    // «COMISION 0,00» aparece en muchas compras con tarjeta: solo es comisión si no es una compra.
    if (k.category === "comisiones" && /\bcompra\b/.test(text)) continue;
    const kind = k.kind ?? "gasto";
    return { category: k.category, kind, source: "palabra" };
  }
  return null;
}

/** Lo que queda sin entender: gasto u otros ingresos según el signo (lo afina la IA o el usuario). */
export const fallbackClass = (amount: number): Classification =>
  amount >= 0 ? { category: "otros_ingresos", kind: "ingreso", source: "auto" } : { category: "otros_gastos", kind: "gasto", source: "auto" };

/** Palabras del nombre del titular (de los nombres de sus cuentas bancarias), sin partículas. */
export function holderTokens(names: string[]) {
  const stop = new Set(["de", "del", "la", "las", "los", "y", "i", "da", "do", "dos", "das", "van", "von"]);
  const out = new Set<string>();
  for (const n of names) for (const w of normalize(n).replace(/[^a-zñ\s]/g, " ").split(/\s+/)) if (w.length > 2 && !stop.has(w)) out.add(w);
  return out;
}

/**
 * ¿La contraparte es el propio titular? (traspasos a sí mismo entre bancos aunque la otra cuenta no esté
 * conectada). Exige al menos tres palabras de su nombre: «José Miguel Lobo Cantos» no es «Miguel Lobo Gómez-Calero».
 */
export function isOwnName(text: string | null | undefined, tokens: Set<string>) {
  if (!text || tokens.size < 2) return false;
  const words = new Set(normalize(text).replace(/[^a-zñ\s]/g, " ").split(/\s+/));
  let hits = 0;
  for (const t of tokens) if (words.has(t)) hits++;
  return hits >= Math.min(3, tokens.size);
}

/**
 * «Transferencia a favor de Miguel BBVA»: el titular se pone a sí mismo con el nombre del banco de destino.
 * Es suya si tras «a favor de» aparece una palabra de su nombre y uno de los bancos donde tiene cuenta.
 */
export function isOwnBankTransfer(text: string | null | undefined, tokens: Set<string>, banks: Set<string>) {
  if (!text || !tokens.size || !banks.size) return false;
  const words = normalize(text).replace(/[^a-zñ\s]/g, " ").split(/\s+/).filter(Boolean);
  for (let i = 0; i < words.length - 2; i++) {
    if (words[i] !== "favor" || words[i + 1] !== "de") continue;
    const next = words.slice(i + 2, i + 6);
    if (next.some((w) => tokens.has(w)) && next.some((w) => banks.has(w))) return true;
  }
  return false;
}

/** Patrón para una regla nueva a partir de una corrección: la clave del comercio, si es lo bastante concreta. */
export function rulePattern(t: { description: string; counterparty: string | null }) {
  const key = merchantKey(t.description, t.counterparty);
  return key.length >= 3 ? key : null;
}

// ---------------------------------------------------------------------------------------------------------
// Transferencias entre cuentas propias
// ---------------------------------------------------------------------------------------------------------
export type TransferPair = { outId: string; inId: string };

/**
 * Empareja salidas y entradas del mismo importe entre dos cuentas propias distintas, a ≤ 4 días.
 * Así una recarga de Revolut desde Santander o el traspaso a BBVA para la hipoteca no cuentan dos veces.
 */
export function findTransferPairs(txs: Tx[], maxDays = 4): TransferPair[] {
  const outs = txs.filter((t) => t.amount < 0 && !t.transferPairId && t.kind !== "devolucion").sort((a, b) => a.date.localeCompare(b.date));
  const ins = txs.filter((t) => t.amount > 0 && !t.transferPairId).sort((a, b) => a.date.localeCompare(b.date));
  const used = new Set<string>();
  const pairs: TransferPair[] = [];
  for (const o of outs) {
    let best: Tx | null = null;
    let bestGap = Infinity;
    for (const i of ins) {
      if (used.has(i.id) || i.accountId === o.accountId) continue;
      if (Math.abs(i.amount + o.amount) > 0.005) continue;
      const gap = Math.abs(daysBetween(o.date, i.date));
      if (gap > maxDays || gap >= bestGap) continue;
      best = i;
      bestGap = gap;
    }
    if (best) {
      used.add(best.id);
      pairs.push({ outId: o.id, inId: best.id });
    }
  }
  return pairs;
}

// ---------------------------------------------------------------------------------------------------------
// Recurrentes: suscripciones, recibos y nómina
// ---------------------------------------------------------------------------------------------------------
export type Recurring = {
  key: string;
  label: string;
  category: string;
  kind: Kind;
  amount: number;
  lastAmount: number;
  previousAmount: number | null;
  frequency: "semanal" | "mensual" | "trimestral" | "anual";
  intervalDays: number;
  lastDate: string;
  nextDate: string;
  firstDate: string;
  count: number;
  active: boolean;
};

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export { median };

/** Categorías de compra suelta: solo cuentan como recurrentes si el importe es prácticamente fijo. */
const VARIABLE_CATEGORIES = new Set(["alimentacion", "restaurantes", "transporte", "compras", "efectivo", "ocio", "otros_gastos"]);

const round2 = (v: number) => Math.round(v * 100) / 100;
export { round2 };

/** Detecta pagos y cobros que se repiten con un intervalo estable. `cancelled`: claves que el usuario dio por canceladas. */
export function detectRecurring(txs: Tx[], today: string, cancelled: Set<string> = new Set()): Recurring[] {
  const groups = new Map<string, Tx[]>();
  for (const t of txs) {
    if (t.kind !== "gasto" && t.kind !== "ingreso") continue;
    if (t.extraordinary) continue;
    const key = `${merchantKey(t.description, t.counterparty)}|${t.amount < 0 ? "-" : "+"}`;
    const g = groups.get(key) ?? [];
    g.push(t);
    groups.set(key, g);
  }
  const out: Recurring[] = [];
  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    // Varios cargos el mismo día (o casi) cuentan como uno: no son frecuencia.
    const dedup: Tx[] = [];
    for (const t of sorted) {
      const prev = dedup[dedup.length - 1];
      if (prev && daysBetween(prev.date, t.date) < 4) continue;
      dedup.push(t);
    }
    if (dedup.length < 2) continue;
    const gaps = dedup.slice(1).map((t, i) => daysBetween(dedup[i].date, t.date));
    const gap = median(gaps);
    const frequency = gap >= 6 && gap <= 8 ? "semanal" : gap >= 26 && gap <= 35 ? "mensual" : gap >= 85 && gap <= 95 ? "trimestral" : gap >= 350 && gap <= 380 ? "anual" : null;
    if (!frequency) continue;
    // Con solo dos apariciones exigimos mensual o más frecuente y que la mayoría de saltos encajen.
    if (dedup.length === 2 && frequency !== "mensual" && frequency !== "semanal") continue;
    const regular = gaps.filter((g) => Math.abs(g - gap) <= Math.max(4, gap * 0.15)).length / gaps.length;
    if (regular < 0.6) continue;
    const amounts = dedup.map((t) => Math.abs(t.amount));
    const med = median(amounts);
    // Muchas compras sueltas en el mismo comercio (súper, gasolina…) no son un recibo.
    if (sorted.length > dedup.length * 1.3) continue;
    const cat = dedup[dedup.length - 1].category;
    const tolerance = cat === "suministros" ? 0.6 : VARIABLE_CATEGORIES.has(cat) || frequency === "semanal" ? 0.03 : 0.3;
    const stable = amounts.filter((a) => Math.abs(a - med) <= med * tolerance).length / amounts.length;
    if (stable < 0.7) continue;
    const last = dedup[dedup.length - 1];
    const intervalDays = Math.round(gap);
    const nextDate = addDays(last.date, intervalDays);
    const merchant = key.split("|")[0];
    const active = !cancelled.has(merchant) && daysBetween(last.date, today) <= intervalDays * 1.5 + 3;
    out.push({
      key: merchant,
      label: cleanLabel(last.counterparty || last.description),
      category: cat,
      kind: last.kind,
      amount: round2(med) * (last.amount < 0 ? -1 : 1),
      lastAmount: last.amount,
      previousAmount: dedup.length > 1 ? dedup[dedup.length - 2].amount : null,
      frequency,
      intervalDays,
      lastDate: last.date,
      nextDate,
      firstDate: dedup[0].date,
      count: dedup.length,
      active,
    });
  }
  return out.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

/** Nombre legible para mostrar (sin referencias ni números de tarjeta). */
export function cleanLabel(s: string) {
  const t = s.replace(/\b\d{4,}\b/g, "").replace(/\*+\d*/g, "").replace(/\s+/g, " ").trim();
  return t.length > 48 ? `${t.slice(0, 46)}…` : t;
}

// ---------------------------------------------------------------------------------------------------------
// Resumen de un ciclo
// ---------------------------------------------------------------------------------------------------------
export type CycleSummary = {
  cycle: Cycle;
  income: number;
  gifts: number;
  expenses: number;
  fixedExpenses: number;
  variableExpenses: number;
  extraordinaryExpenses: number;
  savedToInvestments: number;
  net: number;
  savingsRate: number | null;
  byCategory: { category: string; amount: number }[];
  count: number;
};

/** Suma de un ciclo con el significado real de cada movimiento (sin transferencias internas ni dobles conteos). */
export function summarize(txs: Tx[], cycle: Cycle, recurringKeys: Set<string> = new Set()): CycleSummary {
  let income = 0, gifts = 0, expenses = 0, fixed = 0, extra = 0, saved = 0, count = 0;
  const cats = new Map<string, number>();
  for (const t of txs) {
    if (!inCycle(t, cycle)) continue;
    count++;
    if (t.kind === "ingreso") income += t.amount;
    else if (t.kind === "regalo") gifts += t.amount;
    else if (t.kind === "ahorro") saved -= t.amount;
    else if (t.kind === "gasto" || t.kind === "devolucion") {
      const spend = -t.amount; // gasto positivo; una devolución resta
      expenses += spend;
      cats.set(t.category, (cats.get(t.category) ?? 0) + spend);
      if (t.extraordinary) extra += spend;
      else if (recurringKeys.has(merchantKey(t.description, t.counterparty))) fixed += spend;
    }
  }
  const net = income + gifts - expenses;
  return {
    cycle,
    income: round2(income),
    gifts: round2(gifts),
    expenses: round2(expenses),
    fixedExpenses: round2(fixed),
    variableExpenses: round2(expenses - fixed - extra),
    extraordinaryExpenses: round2(extra),
    savedToInvestments: round2(saved),
    net: round2(net),
    savingsRate: income + gifts > 0 ? round2((net / (income + gifts)) * 100) : null,
    byCategory: [...cats.entries()].map(([category, amount]) => ({ category, amount: round2(amount) })).filter((c) => Math.abs(c.amount) >= 0.005).sort((a, b) => b.amount - a.amount),
    count,
  };
}

// ---------------------------------------------------------------------------------------------------------
// Presupuestos
// ---------------------------------------------------------------------------------------------------------
export type Budget = { id: string; name: string; categories: string[]; amount: number };
export type BudgetStatus = Budget & { spent: number; remaining: number; pct: number; expectedPct: number; status: "ok" | "atencion" | "superado" };

/** Cómo va cada límite en el ciclo: gastado, restante y si va por encima del ritmo esperado. */
export function budgetStatus(budgets: Budget[], summary: CycleSummary, today: string): BudgetStatus[] {
  const total = daysBetween(summary.cycle.start, summary.cycle.end) + 1;
  const elapsed = Math.min(total, Math.max(1, daysBetween(summary.cycle.start, today) + 1));
  const expectedPct = round2((elapsed / total) * 100);
  return budgets.map((b) => {
    const set = new Set(b.categories);
    const spent = round2(summary.byCategory.filter((c) => set.size === 0 || set.has(c.category)).reduce((s, c) => s + c.amount, 0));
    const pct = b.amount > 0 ? round2((spent / b.amount) * 100) : 0;
    const status = pct >= 100 ? "superado" : pct > expectedPct + 10 && pct >= 50 ? "atencion" : "ok";
    return { ...b, spent, remaining: round2(b.amount - spent), pct, expectedPct, status };
  });
}

// ---------------------------------------------------------------------------------------------------------
// Proyección de liquidez del ciclo y de los próximos meses
// ---------------------------------------------------------------------------------------------------------
export type Projection = {
  cycle: Cycle;
  today: string;
  daysLeft: number;
  liquidity: number | null;
  pending: { label: string; category: string; amount: number; date: string }[];
  pendingIncome: number;
  pendingFixed: number;
  expectedVariable: number;
  variableDaily: number;
  projectedEndBalance: number | null;
  projectedNet: number;
  savingsGoal: number | null;
  safeToSpend: number | null;
  basis: string;
};

/**
 * Cómo acabará el ciclo: saldo de hoy + cobros previstos − recibos previstos − gasto variable esperado
 * (media diaria de los últimos ciclos completos, sin extraordinarios ni recurrentes).
 */
export function projectCycle(opts: {
  txs: Tx[];
  today: string;
  startDay: CycleRule;
  liquidity: number | null;
  recurring: Recurring[];
  savingsGoal: number | null;
  history: CycleSummary[];
}): Projection {
  const { today, startDay, liquidity, recurring, savingsGoal, history } = opts;
  const cycle = cycleFor(today, startDay);
  const current = summarize(opts.txs, cycle, new Set(recurring.map((r) => r.key)));
  const daysLeft = Math.max(0, daysBetween(today, cycle.end));
  const pending: Projection["pending"] = [];
  for (const r of recurring) {
    if (!r.active) continue;
    // Siguientes apariciones dentro del ciclo, sin contar las que ya se cobraron/pagaron.
    let d = r.nextDate;
    while (d <= today) d = addDays(d, r.intervalDays);
    while (d <= cycle.end) {
      pending.push({ label: r.label, category: r.category, amount: r.amount, date: d });
      d = addDays(d, r.intervalDays);
    }
  }
  pending.sort((a, b) => a.date.localeCompare(b.date));
  const pendingIncome = round2(pending.filter((p) => p.amount > 0).reduce((s, p) => s + p.amount, 0));
  const pendingFixed = round2(-pending.filter((p) => p.amount < 0).reduce((s, p) => s + p.amount, 0));
  const complete = history.filter((h) => h.cycle.end < cycle.start).slice(0, 3);
  const variableDaily = complete.length
    ? round2(complete.reduce((s, h) => s + h.variableExpenses / (daysBetween(h.cycle.start, h.cycle.end) + 1), 0) / complete.length)
    : round2(current.variableExpenses / Math.max(1, daysBetween(cycle.start, today) + 1));
  const expectedVariable = round2(variableDaily * daysLeft);
  const projectedNet = round2(current.net + pendingIncome - pendingFixed - expectedVariable);
  const projectedEndBalance = liquidity === null ? null : round2(liquidity + pendingIncome - pendingFixed - expectedVariable);
  const safeToSpend = savingsGoal === null ? round2(Math.max(0, projectedNet)) : round2(projectedNet - savingsGoal);
  return {
    cycle,
    today,
    daysLeft,
    liquidity,
    pending,
    pendingIncome,
    pendingFixed,
    expectedVariable,
    variableDaily,
    projectedEndBalance,
    projectedNet,
    savingsGoal,
    safeToSpend,
    basis: complete.length
      ? `Gasto variable medio de los últimos ${complete.length} ciclos completos: ${variableDaily.toFixed(2)} €/día`
      : "Sin ciclos completos todavía: se usa el ritmo de gasto de este ciclo",
  };
}

/** ¿Me lo puedo permitir? Efecto de una compra sobre el ahorro del ciclo, el objetivo y la liquidez. */
export function affordability(p: Projection, amount: number) {
  const netAfter = round2(p.projectedNet - amount);
  const endAfter = p.projectedEndBalance === null ? null : round2(p.projectedEndBalance - amount);
  const goalOk = p.savingsGoal === null ? netAfter >= 0 : netAfter >= p.savingsGoal;
  const verdict = endAfter !== null && endAfter < 0 ? "no" : goalOk ? "si" : "con_ajustes";
  return {
    amount: round2(amount),
    verdict,
    projectedNetBefore: p.projectedNet,
    projectedNetAfter: netAfter,
    projectedEndBalanceAfter: endAfter,
    savingsGoal: p.savingsGoal,
    shortfallVsGoal: p.savingsGoal === null ? null : round2(Math.max(0, p.savingsGoal - netAfter)),
  };
}

/** Ahorro previsto hasta una fecha si sigues como en los últimos ciclos (sin extraordinarios ni regalos). */
export function projectSavings(history: CycleSummary[], current: Projection, until: string, startDay: CycleRule) {
  const complete = history.filter((h) => h.cycle.end < current.cycle.start).slice(0, 3);
  const monthly = complete.length
    ? round2(complete.reduce((s, h) => s + h.income - (h.expenses - h.extraordinaryExpenses), 0) / complete.length)
    : current.projectedNet;
  let cycles = 0;
  let c = cycleFor(current.cycle.end, startDay, 1);
  while (c.end <= until && cycles < 120) {
    cycles++;
    c = cycleFor(c.end, startDay, 1);
  }
  const total = round2(current.projectedNet + monthly * cycles);
  return {
    until,
    monthlyAverage: monthly,
    fullCycles: cycles,
    thisCycleProjected: current.projectedNet,
    total,
    liquidityAtEnd: current.projectedEndBalance === null ? null : round2(current.projectedEndBalance + monthly * cycles),
    basis: complete.length ? `Media de ahorro de los últimos ${complete.length} ciclos completos, sin gastos extraordinarios ni regalos` : "Sin historial suficiente: se repite la previsión de este ciclo",
  };
}

// ---------------------------------------------------------------------------------------------------------
// Evolución de la liquidez: hacia atrás desde el saldo de hoy de cada cuenta
// ---------------------------------------------------------------------------------------------------------
export function liquiditySeries(accounts: { id: string; balance: number | null }[], txs: Tx[], dates: string[]) {
  const withBalance = accounts.filter((a) => a.balance !== null);
  if (!withBalance.length) return [];
  const ids = new Set(withBalance.map((a) => a.id));
  const now = withBalance.reduce((s, a) => s + (a.balance ?? 0), 0);
  const relevant = txs.filter((t) => ids.has(t.accountId)).sort((a, b) => b.date.localeCompare(a.date));
  return dates.map((d) => {
    const after = relevant.filter((t) => t.date > d).reduce((s, t) => s + t.amount, 0);
    return { date: d, balance: round2(now - after) };
  });
}

// ---------------------------------------------------------------------------------------------------------
// Avisos: duplicados, anomalías, subidas de precio, suscripciones nuevas y cambios de hábitos
// ---------------------------------------------------------------------------------------------------------
export type Alert = { key: string; level: "info" | "aviso" | "importante"; title: string; body: string; txIds?: string[] };

export function detectAlerts(opts: { txs: Tx[]; today: string; recurring: Recurring[]; history: CycleSummary[]; current: CycleSummary; budgets: BudgetStatus[] }): Alert[] {
  const { txs, today, recurring, history, current, budgets } = opts;
  const alerts: Alert[] = [];
  const recent = txs.filter((t) => daysBetween(t.date, today) <= 45 && t.kind === "gasto");

  // Posibles cargos duplicados: mismo comercio, mismo importe y cuenta, a ≤ 2 días.
  const seen = new Map<string, Tx>();
  for (const t of [...recent].sort((a, b) => a.date.localeCompare(b.date))) {
    const k = `${t.accountId}|${merchantKey(t.description, t.counterparty)}|${t.amount.toFixed(2)}`;
    const prev = seen.get(k);
    if (prev && daysBetween(prev.date, t.date) <= 2 && Math.abs(t.amount) >= 5 && !recurring.some((r) => r.key === merchantKey(t.description, t.counterparty) && r.frequency === "semanal")) {
      alerts.push({
        key: `dup:${prev.id}:${t.id}`,
        level: "importante",
        title: "Posible cargo duplicado",
        body: `${cleanLabel(t.counterparty || t.description)}: dos cargos de ${Math.abs(t.amount).toFixed(2)} € el ${prev.date} y el ${t.date}.`,
        txIds: [prev.id, t.id],
      });
    }
    seen.set(k, t);
  }

  // Gastos anómalos: más del triple de lo habitual en su categoría (y > 60 €).
  const byCat = new Map<string, number[]>();
  for (const t of txs) if (t.kind === "gasto" && !t.extraordinary) byCat.set(t.category, [...(byCat.get(t.category) ?? []), -t.amount]);
  for (const t of recent) {
    if (t.extraordinary || daysBetween(t.date, today) > 20) continue;
    const vals = byCat.get(t.category) ?? [];
    if (vals.length < 6) continue;
    const med = median(vals);
    if (-t.amount > Math.max(60, med * 3)) {
      alerts.push({
        key: `anom:${t.id}`,
        level: "aviso",
        title: `Gasto inusual en ${categoryOf(t.category).label}`,
        body: `${cleanLabel(t.counterparty || t.description)} (${(-t.amount).toFixed(2)} €) el ${t.date}; lo normal en esta categoría ronda ${med.toFixed(2)} €. Si es puntual, márcalo como extraordinario para que no se proyecte.`,
        txIds: [t.id],
      });
    }
  }

  // Suscripciones y recibos: subidas de precio y altas recientes.
  for (const r of recurring) {
    if (!r.active || r.amount > 0) continue;
    if (r.previousAmount !== null && Math.abs(r.lastAmount) > Math.abs(r.previousAmount) * 1.05 && Math.abs(r.lastAmount) - Math.abs(r.previousAmount) >= 1 && daysBetween(r.lastDate, today) <= 40) {
      alerts.push({
        key: `subida:${r.key}:${r.lastDate}`,
        level: "aviso",
        title: `Ha subido ${r.label}`,
        body: `De ${Math.abs(r.previousAmount).toFixed(2)} € a ${Math.abs(r.lastAmount).toFixed(2)} € (${r.frequency}).`,
      });
    }
    if (r.category === "suscripciones" && daysBetween(r.firstDate, today) <= 75) {
      alerts.push({
        key: `nueva:${r.key}`,
        level: "info",
        title: `Suscripción nueva: ${r.label}`,
        body: `${Math.abs(r.amount).toFixed(2)} € ${r.frequency === "mensual" ? "al mes" : r.frequency}, desde el ${r.firstDate}. ¿La sigues usando?`,
      });
    }
  }
  const subs = recurring.filter((r) => r.active && r.category === "suscripciones" && r.amount < 0);
  if (subs.length >= 3) {
    const monthly = subs.reduce((s, r) => s + Math.abs(r.amount) * (30 / r.intervalDays), 0);
    alerts.push({
      key: `subs-total:${current.cycle.start}`,
      level: "info",
      title: `${subs.length} suscripciones activas`,
      body: `Suman unos ${monthly.toFixed(2)} € al mes (${(monthly * 12).toFixed(0)} € al año). Revisa si usas todas.`,
    });
  }

  // Cambios de hábitos: categorías del último ciclo completo muy por encima de su media.
  const [last, ...prev] = history.filter((h) => h.cycle.end < current.cycle.start);
  if (last && prev.length >= 2) {
    const base = prev.slice(0, 3);
    for (const c of last.byCategory) {
      const avg = base.reduce((s, h) => s + (h.byCategory.find((x) => x.category === c.category)?.amount ?? 0), 0) / base.length;
      if (avg > 20 && c.amount > avg * 1.3 && c.amount - avg >= 40) {
        alerts.push({
          key: `habito:${c.category}:${last.cycle.start}`,
          level: "info",
          title: `Más gasto en ${categoryOf(c.category).label}`,
          body: `${c.amount.toFixed(2)} € en el ciclo ${last.cycle.label}, frente a una media de ${avg.toFixed(2)} € en los anteriores (+${(((c.amount - avg) / avg) * 100).toFixed(0)} %).`,
        });
      }
    }
  }

  for (const b of budgets) {
    if (b.status === "superado") alerts.push({ key: `pres:${b.id}:${current.cycle.start}:100`, level: "importante", title: `Límite superado: ${b.name}`, body: `Llevas ${b.spent.toFixed(2)} € de ${b.amount.toFixed(2)} € en este ciclo.` });
    else if (b.status === "atencion") alerts.push({ key: `pres:${b.id}:${current.cycle.start}:ritmo`, level: "aviso", title: `${b.name}: vas rápido`, body: `Has gastado el ${b.pct.toFixed(0)} % del límite con el ${b.expectedPct.toFixed(0)} % del ciclo transcurrido. Quedan ${b.remaining.toFixed(2)} €.` });
  }

  const order = { importante: 0, aviso: 1, info: 2 } as const;
  return alerts.sort((a, b) => order[a.level] - order[b.level]);
}
