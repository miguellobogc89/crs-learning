// scripts/trading/lab-universo.mjs
// ¿Gana CAMALEÓN si vigila más monedas? Compara sus reglas con las 12 de siempre y con las N más
// negociadas en euros en Bitvavo (las que de verdad podrías copiar), con velas diarias públicas de Bitvavo.
// Solo LEE datos públicos: no toca la base de datos ni opera.
//
// Uso (en tu PC, desde la carpeta del proyecto):
//   node scripts/trading/lab-universo.mjs                 (5 años, top 40; descarga todas las monedas en euros: unos minutos)
//   node scripts/trading/lab-universo.mjs --top 60 --years 3
import { load } from "../../tests/trading/helpers.mjs";

const { simulate, CHIP, HOLD_BTC, withUniverse } = load("lib/trading/lab/strategies.ts");
const API = "https://api.bitvavo.com/v2";
const BASE12 = ["BTC", "ETH", "SOL", "XRP", "BNB", "ADA", "DOGE", "AVAX", "DOT", "LINK", "LTC", "TRX"];
// Monedas estables y oro: no son inversiones con tendencia.
const SKIP = new Set(["USDC", "USDT", "EURC", "EURT", "DAI", "TUSD", "PYUSD", "FDUSD", "USDE", "USDS", "USDP", "XAUT", "PAXG", "EURI", "RLUSD"]);
const DAY = 86_400_000;
const arg = (name, def) => {
  const k = process.argv.indexOf(`--${name}`);
  return k > 0 ? Number(process.argv[k + 1]) : def;
};
const years = arg("years", 5);
const top = arg("top", 40);
const fee = arg("fee", 0.25);
const periodDays = Math.round(years * 365);

const get = async (path) => {
  const res = await fetch(`${API}${path}`, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Velas diarias de Bitvavo (máx. 1440 por petición, de la más nueva a la más antigua). */
async function candles(market, days) {
  const out = new Map();
  let end = Date.now();
  const start = Date.now() - days * DAY;
  while (end > start) {
    const q = new URLSearchParams({ interval: "1d", limit: "1440", start: String(start), end: String(end) });
    const rows = await get(`/${market}/candles?${q}`);
    if (!rows.length) break;
    for (const r of rows) out.set(r[0], { t: r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] });
    const oldest = Math.min(...rows.map((r) => r[0]));
    if (rows.length < 1440 || oldest <= start) break;
    end = oldest - 1;
    await sleep(150);
  }
  const list = [...out.values()].sort((a, b) => a.t - b.t);
  if (list.length && list[list.length - 1].t > Date.now() - DAY) list.pop(); // la de hoy, sin cerrar
  return list;
}

const pct = (v, d = 1) => `${v > 0 ? "+" : ""}${v.toFixed(d).replace(".", ",")} %`;
const day = (t) => new Date(t).toISOString().slice(0, 10);
const pad = (s, n) => String(s).padStart(n);

// 1) Universo: mercados en euros de Bitvavo, ordenados por lo que se negocia en 24 h.
const markets = (await get("/markets")).filter((m) => m.quote === "EUR" && m.status === "trading" && !SKIP.has(m.base));
const volume = new Map((await get("/ticker/24h")).map((t) => [t.market, Number(t.volumeQuote) || 0]));
const ranked = markets.sort((a, b) => (volume.get(b.market) ?? 0) - (volume.get(a.market) ?? 0));
// Para la prueba sin sesgo hacen falta TODAS las monedas en euros (la lista «de cada momento» se calcula con su volumen de entonces).
const chosen = [...new Set([...BASE12.filter((b) => markets.some((m) => m.base === b)), ...ranked.map((m) => m.base)])];

console.log(`\nDescargando ${chosen.length} monedas de Bitvavo…`);
const coins = [];
for (const base of chosen) {
  try {
    const c = await candles(`${base}-EUR`, periodDays + 230);
    if (c.length > 60) coins.push({ symbol: `${base}-EUR`, candles: c });
  } catch (e) {
    console.log(`  (sin datos de ${base}: ${e.message})`);
  }
  await sleep(120);
}
if (!coins.some((c) => c.symbol === "BTC-EUR")) throw new Error("Sin datos de Bitcoin");
const from = Date.now() - periodDays * DAY;
const base12 = coins.filter((c) => BASE12.includes(c.symbol.replace("-EUR", "")));
const topN = coins.filter((c) => ranked.slice(0, top).some((m) => `${m.base}-EUR` === c.symbol) || c.symbol === "BTC-EUR");
const withHistory = (cs, t) => cs.filter((c) => c.candles[0].t <= t).length;

const camaleon = CHIP.find((s) => s.key === "chip-b-rupt");
const chipA = CHIP.find((s) => s.key === "chip-a-rupt");
const entries = [
  { name: "Mantener Bitcoin", s: HOLD_BTC, coins: base12 },
  { name: `CAMALEÓN · 12 de siempre`, s: camaleon, coins: base12 },
  { name: `CAMALEÓN · top ${top} de HOY (sesgo)`, s: camaleon, coins: topN },
  { name: `CAMALEÓN · top ${top} de cada momento`, s: withUniverse(camaleon, top), coins },
  { name: `CAMALEÓN · top 20 de cada momento`, s: withUniverse(camaleon, 20), coins },
  { name: `Chip A rupt. · top ${top} cada momento`, s: withUniverse(chipA, top), coins },
];

console.log(`\nCAMALEÓN con más monedas · velas diarias de Bitvavo en euros · comisión ${fee} % por orden + 0,05 % deslizamiento`);
console.log(`Monedas con datos al empezar (${day(from)}): 12 de siempre ${withHistory(base12, from)} · top ${top} de hoy ${withHistory(topN, from)} · todas ${withHistory(coins, from)} de ${coins.length} (las nuevas entran cuando empiezan a cotizar)`);
console.log(`«De cada momento»: cada día solo vigila las monedas con más volumen en euros del mes anterior y con 60 días cotizando: no sabe cuáles serán famosas.\n`);

const W = 40;
console.log(`Periodo completo (${years} años)`);
console.log(`${"Agente".padEnd(W)} ${pad("Total", 10)} ${pad("Al año", 9)} ${pad("Caída", 9)} ${pad("Invert.", 8)} ${pad("Cambios", 8)}`);
for (const e of entries) {
  const x = simulate(e.coins, e.s, { from, feePct: fee }).stats;
  console.log(`${e.name.padEnd(W)} ${pad(pct(x.totalPct), 10)} ${pad(pct(x.yearlyPct), 9)} ${pad(pct(x.maxDrawdownPct), 9)} ${pad(`${x.exposurePct.toFixed(0)} %`, 8)} ${pad(x.rebalances, 8)}`);
}

console.log(`\nAño a año (rentabilidad)`);
const cuts = [];
for (let t = from; t < Date.now() - 7 * DAY; t += 365 * DAY) cuts.push([t, Math.min(Date.now(), t + 365 * DAY)]);
console.log(`${"Agente".padEnd(W)} ${cuts.map(([a]) => pad(day(a).slice(0, 7), 10)).join(" ")}`);
for (const e of entries) console.log(`${e.name.padEnd(W)} ${cuts.map(([a, b]) => pad(pct(simulate(e.coins, e.s, { from: a, to: b, feePct: fee }).stats.totalPct), 10)).join(" ")}`);

const starts = [];
for (let t = from; t + 365 * DAY <= Date.now(); t += 14 * DAY) starts.push(t);
console.log(`\nRobustez: ${starts.length} ventanas de 1 año, empezando cada 2 semanas`);
console.log(`${"Agente".padEnd(W)} ${pad("Mediana", 10)} ${pad("Peor", 10)} ${pad("Mejor", 10)} ${pad("En +", 7)} ${pad("Gana a BTC", 11)} ${pad("Caída med.", 11)}`);
const btcWin = starts.map((a) => simulate(base12, HOLD_BTC, { from: a, to: a + 365 * DAY, feePct: fee }).stats.totalPct);
const med = (v) => v[Math.floor(v.length / 2)];
for (const e of entries) {
  const rs = starts.map((a) => simulate(e.coins, e.s, { from: a, to: a + 365 * DAY, feePct: fee }).stats);
  const tot = rs.map((x) => x.totalPct);
  const sorted = [...tot].sort((x, y) => x - y);
  const dds = rs.map((x) => x.maxDrawdownPct).sort((x, y) => x - y);
  const beat = tot.filter((v, k) => v > btcWin[k]).length;
  console.log(
    `${e.name.padEnd(W)} ${pad(pct(med(sorted)), 10)} ${pad(pct(sorted[0]), 10)} ${pad(pct(sorted[sorted.length - 1]), 10)} ${pad(`${Math.round((tot.filter((v) => v > 0).length / tot.length) * 100)} %`, 7)} ${pad(`${Math.round((beat / tot.length) * 100)} %`, 11)} ${pad(pct(med(dds)), 11)}`,
  );
}

const usedTop = topN.map((c) => c.symbol.replace("-EUR", "")).join(", ");
console.log(`\nTop ${top} por volumen hoy en Bitvavo: ${usedTop}`);
console.log(`Ojo: «de HOY» usa la lista actual (sabe el futuro: sesgo). La que vale es «de cada momento». Aun así faltan las monedas que Bitvavo ya retiró.\n`);
