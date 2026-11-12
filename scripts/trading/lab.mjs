// scripts/trading/lab.mjs
// Laboratorio de agentes: compara estrategias candidatas con velas diarias públicas de Binance en euros.
// Solo LEE datos públicos: no toca la base de datos ni opera.
//
// Uso (en tu PC, desde la carpeta del proyecto):
//   node scripts/trading/lab.mjs              (3 años)
//   node scripts/trading/lab.mjs --years 2 --fee 0.15
import { load } from "../../tests/trading/helpers.mjs";

const { simulate, CANDIDATES, HOLD_BTC } = load("lib/trading/lab/strategies.ts");
const BINANCE = "https://data-api.binance.vision";
const COINS = ["BTC", "ETH", "SOL", "XRP", "BNB", "ADA", "DOGE", "AVAX", "DOT", "LINK", "LTC", "TRX"];
const arg = (name, def) => {
  const k = process.argv.indexOf(`--${name}`);
  return k > 0 ? Number(process.argv[k + 1]) : def;
};
const years = arg("years", 3);
const fee = arg("fee", 0.25);
const DAY = 86_400_000;

async function klines(pair, days) {
  const out = [];
  let start = Date.now() - days * DAY;
  while (start < Date.now()) {
    const q = new URLSearchParams({ symbol: pair, interval: "1d", startTime: String(start), limit: "1000" });
    const res = await fetch(`${BINANCE}/api/v3/klines?${q}`, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`${pair}: ${res.status}`);
    const rows = await res.json();
    if (!rows.length) break;
    for (const r of rows) out.push({ t: r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] });
    start = rows[rows.length - 1][0] + DAY;
    if (rows.length < 1000) break;
  }
  if (out.length && out[out.length - 1].t > Date.now() - DAY) out.pop(); // vela de hoy, sin cerrar
  return out;
}

const pct = (v, d = 1) => `${v > 0 ? "+" : ""}${v.toFixed(d).replace(".", ",")} %`;
const day = (t) => new Date(t).toISOString().slice(0, 10);
const pad = (s, n) => String(s).padStart(n);

const coins = [];
for (const c of COINS) {
  try {
    coins.push({ symbol: `${c}-EUR`, candles: await klines(`${c}EUR`, Math.round(years * 365) + 230) });
  } catch (e) {
    console.log(`(sin datos de ${c}: ${e.message})`);
  }
}
const from = Date.now() - Math.round(years * 365) * DAY;
const all = [HOLD_BTC, ...CANDIDATES];

console.log(`\nLaboratorio de agentes · ${coins.length} crypto en euros · comisión ${fee} % por orden + 0,05 % deslizamiento\n`);
const head = `${"Estrategia".padEnd(26)} ${pad("Total", 10)} ${pad("Al año", 9)} ${pad("Semana", 8)} ${pad("Sem.+", 6)} ${pad("Caída", 9)} ${pad("Invert.", 8)} ${pad("Cambios", 8)}`;
console.log(`Periodo completo (${years} años)`);
console.log(head);
const results = all.map((s) => simulate(coins, s, { from, feePct: fee }));
for (const r of results) {
  const x = r.stats;
  console.log(
    `${r.name.padEnd(26)} ${pad(pct(x.totalPct), 10)} ${pad(pct(x.yearlyPct), 9)} ${pad(pct(x.weeklyPct, 2), 8)} ${pad(`${x.positiveWeeksPct.toFixed(0)} %`, 6)} ${pad(pct(x.maxDrawdownPct), 9)} ${pad(`${x.exposurePct.toFixed(0)} %`, 8)} ${pad(x.rebalances, 8)}`,
  );
}

// Año a año: una buena estrategia no puede depender de un solo año.
console.log(`\nAño a año (rentabilidad)`);
const cuts = [];
for (let y = 0; y < years; y++) cuts.push([from + y * 365 * DAY, Math.min(Date.now(), from + (y + 1) * 365 * DAY)]);
console.log(`${"Estrategia".padEnd(26)} ${cuts.map(([a]) => pad(day(a).slice(0, 7), 10)).join(" ")}`);
for (const s of all) {
  const row = cuts.map(([a, b]) => pad(pct(simulate(coins, s, { from: a, to: b, feePct: fee }).stats.totalPct), 10));
  console.log(`${s.name.padEnd(26)} ${row.join(" ")}`);
}

console.log(`\nQué hace cada una:`);
for (const s of all) console.log(`  · ${s.name}: ${s.idea}`);
console.log(`\nSem.+ = semanas en positivo · Caída = peor caída desde un máximo · Invert. = tiempo con dinero dentro.`);
console.log(`Es historia, no garantía: buscamos algo que gane a mantener Bitcoin con menos caída, y que no dependa de un solo año.\n`);
