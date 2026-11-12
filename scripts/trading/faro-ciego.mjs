// scripts/trading/faro-ciego.mjs
// Prueba a ciegas de FARO: ¿sus ideas eligen mejor moneda que el azar o que una regla sin IA?
// Lee las ideas ya resueltas de la base de datos y, para cada una, prueba «gemelas» en otras monedas:
// misma hora, mismo % de stop y de objetivo y misma validez. Velas horarias públicas de Binance.
// Solo LEE: no toca nada ni opera.
//
// Uso (en tu PC, desde la carpeta del proyecto):
//   node --env-file=.env scripts/trading/faro-ciego.mjs
//   node --env-file=.env scripts/trading/faro-ciego.mjs --bitvavo     (azar solo entre monedas de Bitvavo)
import { load } from "../../tests/trading/helpers.mjs";

const { compareIdea, luckShare, styleOfKind } = load("lib/trading/faro/blind.ts");
const BINANCE = "https://data-api.binance.vision";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const SKIP = new Set(["USDC", "USDT", "EUR", "EURI", "FDUSD", "TUSD", "DAI", "USDP", "PAXG", "XAUT", "USDE", "USD1", "BUSD", "AEUR"]);
const onlyBitvavo = process.argv.includes("--bitvavo");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (url) => {
  for (let k = 0; ; k++) {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (res.ok) return res.json();
    if (k >= 2 || (res.status !== 429 && res.status < 500)) throw new Error(`${url.split("?")[0]}: ${res.status}`);
    await sleep(2000 * (k + 1));
  }
};
const pct = (v, d = 2) => `${v > 0 ? "+" : ""}${v.toFixed(d).replace(".", ",")} %`;
const pad = (s, n) => String(s).padStart(n);
const avg = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);

function connString(raw) {
  const url = new URL(raw);
  const mode = url.searchParams.get("sslmode")?.toLowerCase();
  if (mode === "require" || mode === "prefer" || mode === "verify-ca") url.searchParams.set("sslmode", "verify-full");
  return url.toString();
}

async function hourly(pair, from, to) {
  const out = [];
  let start = from;
  while (start < to) {
    const q = new URLSearchParams({ symbol: pair, interval: "1h", startTime: String(start), endTime: String(to), limit: "1000" });
    const rows = await get(`${BINANCE}/api/v3/klines?${q}`);
    if (!rows.length) break;
    for (const r of rows) out.push({ t: r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], qv: +r[7] });
    start = rows[rows.length - 1][0] + HOUR;
    if (rows.length < 1000) break;
  }
  return out.filter((b) => b.c > 0);
}

// 1) Ideas ya resueltas.
if (!process.env.DATABASE_URL) throw new Error("Falta DATABASE_URL: ejecuta con  node --env-file=.env scripts/trading/faro-ciego.mjs");
const { default: pg } = await import("pg");
const db = new pg.Client({ connectionString: connString(process.env.DATABASE_URL) });
await db.connect();
const { rows } = await db.query(
  `SELECT pair, kind, price, invalidation, target, created_at, valid_until, status, result_pct FROM trading_faro_ideas
   WHERE status <> 'viva' AND valid_until < now() ORDER BY created_at`,
);
await db.end();
if (!rows.length) throw new Error("FARO aún no tiene ideas resueltas.");
const ideas = rows.map((r) => ({
  pair: r.pair,
  kind: r.kind,
  price: r.price,
  invalidation: r.invalidation,
  target: r.target,
  createdAt: new Date(r.created_at).getTime(),
  validUntil: new Date(r.valid_until).getTime(),
  stored: r.result_pct,
}));
const from = ideas[0].createdAt - 4 * DAY;
const to = Math.min(Date.now(), Math.max(...ideas.map((i) => i.validUntil)) + 2 * HOUR);
console.log(`\nIdeas de FARO resueltas: ${ideas.length} (${new Date(ideas[0].createdAt).toISOString().slice(0, 10)} → ${new Date(ideas[ideas.length - 1].createdAt).toISOString().slice(0, 10)})`);

// 2) Universo: pares de Binance en euros o USDC (uno por moneda), más los que usó FARO.
const info = await get(`${BINANCE}/api/v3/exchangeInfo?permissions=SPOT`);
const listed = info.symbols.filter((s) => (s.quoteAsset === "EUR" || s.quoteAsset === "USDC") && s.status === "TRADING" && !SKIP.has(s.baseAsset));
let bitvavo = null;
if (onlyBitvavo) {
  const m = await get("https://api.bitvavo.com/v2/markets");
  bitvavo = new Set(m.filter((x) => x.quote === "EUR" && x.status === "trading").map((x) => x.base.toUpperCase()));
}
const byBase = new Map();
for (const s of listed) {
  if (bitvavo && !bitvavo.has(s.baseAsset)) continue;
  const prev = byBase.get(s.baseAsset);
  if (!prev || (prev.quoteAsset === "EUR" && s.quoteAsset === "USDC")) byBase.set(s.baseAsset, s);
}
const pairs = new Map([...byBase.values()].map((s) => [s.symbol, s.baseAsset]));
const quoteOf = new Map(info.symbols.map((s) => [s.symbol, { base: s.baseAsset, quote: s.quoteAsset }]));
for (const i of ideas) if (!pairs.has(i.pair)) pairs.set(i.pair, quoteOf.get(i.pair)?.base ?? i.pair.replace(/(EUR|USDC)$/, ""));

// USDC → euros, hora a hora.
const fx = new Map((await hourly("EURUSDC", from, to)).map((b) => [b.t, 1 / b.c]));
const toEur = (pair, bars) => {
  if (!pair.endsWith("USDC")) return bars;
  let k = null;
  const out = [];
  for (const b of bars) {
    k = fx.get(b.t) ?? k;
    if (k) out.push({ t: b.t, o: b.o * k, h: b.h * k, l: b.l * k, c: b.c * k, qv: b.qv * k });
  }
  return out;
};

console.log(`Descargando velas horarias de ${pairs.size} monedas${onlyBitvavo ? " (solo las de Bitvavo)" : ""}…`);
const universe = [];
let n = 0;
for (const [pair, base] of pairs) {
  try {
    const bars = toEur(pair, await hourly(pair, from, to));
    if (bars.length > 30) universe.push({ pair, base, bars });
  } catch {
    // sin velas: fuera
  }
  if (++n % 50 === 0) console.log(`  ${n}/${pairs.size}`);
  await sleep(60);
}

// 3) Comparación idea a idea.
const results = [];
for (const i of ideas) {
  const c = compareIdea(i, universe);
  if (c) results.push({ ...c, kind: i.kind, pair: i.pair, stored: i.stored });
}
if (!results.length) throw new Error("No se pudo comparar ninguna idea (¿faltan velas?).");
const skipped = ideas.length - results.length;

function block(title, rs) {
  if (!rs.length) return;
  const mech = rs.filter((r) => r.mechanical !== null);
  const hit = (v) => `${Math.round((v.filter((x) => x > 0).length / v.length) * 100)} %`;
  const luck = luckShare(rs);
  console.log(`\n${title} · ${rs.length} ideas`);
  console.log(`${"".padEnd(30)} ${pad("Media/idea", 11)} ${pad("En +", 6)} ${pad("Suma", 10)}`);
  const line = (name, v) => console.log(`${name.padEnd(30)} ${pad(pct(avg(v)), 11)} ${pad(hit(v), 6)} ${pad(pct(v.reduce((a, b) => a + b, 0), 1), 10)}`);
  line("FARO (la IA)", rs.map((r) => r.faro));
  if (mech.length) line("Regla sin IA (1.ª de la lista)", mech.map((r) => r.mechanical));
  line("Azar (media de todas)", rs.map((r) => r.randomAvg));
  const beatRand = rs.filter((r) => r.faro > r.randomAvg).length;
  console.log(`  FARO supera al azar en ${beatRand} de ${rs.length} ideas · el azar iguala o supera a FARO en el ${Math.round(luck * 100)} % de los sorteos`);
}

console.log(`\nCada idea se compara con gemelas: misma hora, mismo % de stop y objetivo y misma validez, en otra moneda.`);
console.log(`Resultado neto de 0,35 % de costes por idea. Velas horarias (FARO usa de 5 min: puede variar un poco).`);
if (skipped) console.log(`(${skipped} ideas sin velas suficientes, fuera)`);

block("TODAS", results);
for (const kind of ["rebote", "impulso", "ruptura", "noticia"]) block(`${kind.toUpperCase()} → kamikazes de ${styleOfKind(kind)}`, results.filter((r) => r.kind === kind));

const stored = results.filter((r) => typeof r.stored === "number");
if (stored.length) console.log(`\nComprobación: media guardada por FARO (velas de 5 min) ${pct(avg(stored.map((r) => r.stored)))} vs recalculada ${pct(avg(stored.map((r) => r.faro)))}`);

console.log(`\nCómo leerlo: si FARO no gana claramente al azar (el azar le iguala en más de un 20 % de los sorteos), sus ideas no aportan.`);
console.log(`Si la regla sin IA hace lo mismo o más, la IA sobra: bastaría con la lista ordenada.`);
console.log(`Con pocas ideas (menos de ~100) todo es orientativo.\n`);
