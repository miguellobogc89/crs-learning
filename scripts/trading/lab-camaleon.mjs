// scripts/trading/lab-camaleon.mjs
// ¿De dónde sale la ventaja de CAMALEÓN-4? Una sola prueba, con reglas fijadas antes de ver resultados:
//   · Mantener Bitcoin (referencia)
//   · CAMALEÓN-4 tal cual (detector B + rupturas, reparto igual)
//   · CAMALEÓN-0: mismo detector, pero en ataque solo Bitcoin  → ¿la ventaja es el «cuándo» o el «qué»?
//   · CAMALEÓN con reparto por riesgo (más peso a las monedas tranquilas)
//   · CAMALEÓN con termómetro (si pocas monedas acompañan, solo media posición)
// Y lo más importante: el tramo 2019-2021, que NUNCA usamos para diseñar CAMALEÓN (prueba a ciegas).
// Velas diarias públicas de Bitvavo en euros. Solo LEE datos públicos: no toca la base de datos ni opera.
//
// Uso (en tu PC, desde la carpeta del proyecto):
//   node scripts/trading/lab-camaleon.mjs
import { load } from "../../tests/trading/helpers.mjs";

const { simulate, CHIP, LAB2, HOLD_BTC, contextAt, explainDetectorB, breadth } = load("lib/trading/lab/strategies.ts");
const API = "https://api.bitvavo.com/v2";
const COINS = ["BTC", "ETH", "SOL", "XRP", "BNB", "ADA", "DOGE", "AVAX", "DOT", "LINK", "LTC", "TRX"];
const DAY = 86_400_000;
const arg = (name, def) => {
  const k = process.argv.indexOf(`--${name}`);
  return k > 0 ? Number(process.argv[k + 1]) : def;
};
const fee = arg("fee", 0.25);
// Desde aquí hacia atrás nunca lo miramos al diseñar CAMALEÓN (sus pruebas fueron de los últimos 5 años).
const DESIGN_FROM = Date.parse("2021-11-12T00:00:00Z");
const FIRST = Date.parse("2019-01-01T00:00:00Z");

const get = async (path) => {
  const res = await fetch(`${API}${path}`, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function candles(market) {
  const out = new Map();
  let end = Date.now();
  while (end > FIRST) {
    const q = new URLSearchParams({ interval: "1d", limit: "1440", start: String(FIRST), end: String(end) });
    const rows = await get(`/${market}/candles?${q}`);
    if (!rows.length) break;
    for (const r of rows) out.set(r[0], { t: r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] });
    const oldest = Math.min(...rows.map((r) => r[0]));
    if (rows.length < 1440 || oldest <= FIRST) break;
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

console.log(`\nDescargando ${COINS.length} monedas de Bitvavo desde 2019…`);
const coins = [];
for (const c of COINS) {
  try {
    const list = await candles(`${c}-EUR`);
    if (list.length > 60) coins.push({ symbol: `${c}-EUR`, candles: list });
  } catch (e) {
    console.log(`  (sin datos de ${c}: ${e.message})`);
  }
  await sleep(120);
}
const btc = coins.find((c) => c.symbol === "BTC-EUR");
if (!btc) throw new Error("Sin datos de Bitcoin");
// 230 días de calentamiento para que existan las medias de 200 días.
const start = btc.candles[0].t + 230 * DAY;

const camaleon = CHIP.find((s) => s.key === "chip-b-rupt");
const entries = [
  { name: "Mantener Bitcoin", s: HOLD_BTC },
  { name: "CAMALEÓN-4 (el actual)", s: camaleon },
  ...LAB2.map((s) => ({ name: s.name, s })),
];
const W = 34;
const run = (s, from, to) => simulate(coins, s, { from, to, feePct: fee }).stats;

function table(title, from, to) {
  console.log(`\n${title} · ${day(from)} → ${day(to)}`);
  console.log(`${"Agente".padEnd(W)} ${pad("Total", 10)} ${pad("Al año", 9)} ${pad("Caída", 9)} ${pad("Invert.", 8)} ${pad("Cambios", 8)}`);
  for (const e of entries) {
    const x = run(e.s, from, to);
    console.log(`${e.name.padEnd(W)} ${pad(pct(x.totalPct), 10)} ${pad(pct(x.yearlyPct), 9)} ${pad(pct(x.maxDrawdownPct), 9)} ${pad(`${x.exposurePct.toFixed(0)} %`, 8)} ${pad(x.rebalances, 8)}`);
  }
}

console.log(`\nDe dónde sale la ventaja de CAMALEÓN · velas diarias de Bitvavo en euros · comisión ${String(fee).replace(".", ",")} % por orden + 0,05 % deslizamiento`);
const late = coins.filter((c) => c.candles[0].t > start).map((c) => `${c.symbol.replace("-EUR", "")} (${day(c.candles[0].t).slice(0, 7)})`);
if (late.length) console.log(`Monedas que entran más tarde (cuando empiezan a cotizar en Bitvavo): ${late.join(", ")}`);

table("1) A CIEGAS: tramo que nunca usamos para diseñar", start, DESIGN_FROM);
table("2) Tramo con el que se diseñó (últimos 5 años)", DESIGN_FROM, Date.now());
table("3) Todo junto", start, Date.now());

console.log(`\nAño a año (rentabilidad)`);
const cuts = [];
for (let t = start; t < Date.now() - 7 * DAY; t += 365 * DAY) cuts.push([t, Math.min(Date.now(), t + 365 * DAY)]);
console.log(`${"Agente".padEnd(W)} ${cuts.map(([a]) => pad(day(a).slice(0, 7), 10)).join(" ")}`);
for (const e of entries) console.log(`${e.name.padEnd(W)} ${cuts.map(([a, b]) => pad(pct(run(e.s, a, b).totalPct), 10)).join(" ")}`);

const med = (v) => v[Math.floor(v.length / 2)];
function robustness(title, from, to) {
  const starts = [];
  for (let t = from; t + 365 * DAY <= to; t += 14 * DAY) starts.push(t);
  if (!starts.length) return;
  console.log(`\nRobustez ${title}: ${starts.length} ventanas de 1 año, empezando cada 2 semanas`);
  console.log(`${"Agente".padEnd(W)} ${pad("Mediana", 10)} ${pad("Peor", 10)} ${pad("Mejor", 10)} ${pad("En +", 7)} ${pad("Gana a BTC", 11)} ${pad("Caída med.", 11)}`);
  const btcWin = starts.map((a) => run(HOLD_BTC, a, a + 365 * DAY).totalPct);
  for (const e of entries) {
    const rs = starts.map((a) => run(e.s, a, a + 365 * DAY));
    const tot = rs.map((x) => x.totalPct);
    const sorted = [...tot].sort((x, y) => x - y);
    const dds = rs.map((x) => x.maxDrawdownPct).sort((x, y) => x - y);
    const beat = tot.filter((v, k) => v > btcWin[k]).length;
    console.log(
      `${e.name.padEnd(W)} ${pad(pct(med(sorted)), 10)} ${pad(pct(sorted[0]), 10)} ${pad(pct(sorted[sorted.length - 1]), 10)} ${pad(`${Math.round((tot.filter((v) => v > 0).length / tot.length) * 100)} %`, 7)} ${pad(`${Math.round((beat / tot.length) * 100)} %`, 11)} ${pad(pct(med(dds)), 11)}`,
    );
  }
}
robustness("a ciegas", start, DESIGN_FROM);
robustness("de los últimos 5 años", DESIGN_FROM, Date.now());

// Hoy: modo del detector y termómetro, con la última vela cerrada.
const last = btc.candles.length - 1;
const ctx = contextAt(coins, btc.candles[last].t, 1, () => false);
const det = explainDetectorB(ctx);
if (det.btc === null) console.log("(sin vela de Bitcoin para hoy)");
console.log(`\nHoy (${day(btc.candles[last].t)}): detector ${det.attack ? "ATAQUE" : "DEFENSA"} · ${det.checks.map((c) => `${c.ok ? "✓" : "✗"} ${c.text}`).join(" · ")}`);
console.log(`Termómetro: ${Math.round(breadth(ctx) * 100)} % de las demás monedas por encima de su media de 50 días.`);
for (const e of entries.slice(1)) {
  const r = simulate(coins, e.s, { from: Date.now() - 400 * DAY, feePct: fee });
  const held = Object.keys(r.lastWeights ?? {}).map((s) => s.replace("-EUR", ""));
  console.log(`  · ${e.name}: ${held.length ? held.join(", ") : "efectivo"}`);
}

console.log(`\nQué hace cada uno:`);
for (const e of entries) console.log(`  · ${e.name}: ${e.s.idea ?? ""}`);
console.log(`\nCómo leerlo: lo que importa es la tabla 1 (a ciegas). Si CAMALEÓN-4 también gana a Bitcoin ahí con menos caída, la idea aguanta.`);
console.log(`Si CAMALEÓN-0 gana igual o más, la ventaja está en «cuándo estar dentro», no en elegir monedas.`);
console.log(`Las ventanas se solapan (no son independientes): sirven para ver estabilidad, no como prueba estadística.\n`);
