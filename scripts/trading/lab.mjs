// scripts/trading/lab.mjs
// Laboratorio de agentes: compara estrategias candidatas con velas diarias públicas de Binance en euros.
// Solo LEE datos públicos: no toca la base de datos ni opera.
//
// Uso (en tu PC, desde la carpeta del proyecto):
//   node scripts/trading/lab.mjs              (3 años)
//   node scripts/trading/lab.mjs --years 2 --fee 0.15
//   node scripts/trading/lab.mjs --months 6      (periodo corto: mes a mes y ventanas de 3 meses)
//   node scripts/trading/lab.mjs --years 5 --cortos   (solo los agentes que apuestan a la baja en defensa)
import { load } from "../../tests/trading/helpers.mjs";

const { simulate: sim, CANDIDATES, CHIP, SHORTS, HOLD_BTC } = load("lib/trading/lab/strategies.ts");
const BINANCE = "https://data-api.binance.vision";
const COINS = ["BTC", "ETH", "SOL", "XRP", "BNB", "ADA", "DOGE", "AVAX", "DOT", "LINK", "LTC", "TRX"];
const arg = (name, def) => {
  const k = process.argv.indexOf(`--${name}`);
  return k > 0 ? Number(process.argv[k + 1]) : def;
};
const months = arg("months", 0);
const years = months ? months / 12 : arg("years", 3);
const periodDays = Math.round(years * 365);
const fee = arg("fee", 0.25);
// Coste de estar corto (financiación de futuros), en % al día. 0,03 % ≈ 11 % al año: prudente.
const shortFunding = arg("funding", 0.03);
const simulate = (coins, s, o) => sim(coins, s, { ...o, shortFundingPct: shortFunding });
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
    coins.push({ symbol: `${c}-EUR`, candles: await klines(`${c}EUR`, periodDays + 230) });
  } catch (e) {
    console.log(`(sin datos de ${c}: ${e.message})`);
  }
}
const from = Date.now() - periodDays * DAY;
// Pares que dejan de cotizar en euros dentro del periodo (se venden a su último cierre).
const ended = coins.filter((c) => c.candles.length && c.candles[c.candles.length - 1].t < Date.now() - 5 * DAY);
if (ended.length) console.log(`Ojo: sin datos recientes de ${ended.map((c) => `${c.symbol} (hasta ${day(c.candles[c.candles.length - 1].t)})`).join(", ")}`);
const only = process.argv.includes("--cortos");
const all = only ? [HOLD_BTC, CHIP.find((s) => s.key === "chip-b-rupt"), ...SHORTS] : [HOLD_BTC, ...CANDIDATES, ...CHIP, ...SHORTS];

console.log(`\nLaboratorio de agentes · ${coins.length} crypto en euros · comisión ${fee} % por orden + 0,05 % deslizamiento · corto: ${shortFunding} % al día de financiación, sin apalancamiento\n`);
const head = `${"Estrategia".padEnd(30)} ${pad("Total", 10)} ${pad("Al año", 9)} ${pad("Semana", 8)} ${pad("Sem.+", 6)} ${pad("Caída", 9)} ${pad("Invert.", 8)} ${pad("Cambios", 8)}`;
console.log(`Periodo completo (${months ? `${months} meses` : `${years} años`}: ${day(from)} → hoy)`);
console.log(head);
const results = all.map((s) => simulate(coins, s, { from, feePct: fee }));
for (const r of results) {
  const x = r.stats;
  console.log(
    `${r.name.padEnd(30)} ${pad(pct(x.totalPct), 10)} ${pad(pct(x.yearlyPct), 9)} ${pad(pct(x.weeklyPct, 2), 8)} ${pad(`${x.positiveWeeksPct.toFixed(0)} %`, 6)} ${pad(pct(x.maxDrawdownPct), 9)} ${pad(`${x.exposurePct.toFixed(0)} %`, 8)} ${pad(x.rebalances, 8)}`,
  );
}

// Por tramos: años en periodos largos; meses en periodos cortos.
const short = periodDays < 730;
const step = short ? 30.4 * DAY : 365 * DAY;
console.log(`\n${short ? "Mes a mes" : "Año a año"} (rentabilidad)`);
const cuts = [];
for (let t = from; t < Date.now() - 7 * DAY; t += step) cuts.push([t, Math.min(Date.now(), t + step)]);
console.log(`${"Estrategia".padEnd(30)} ${cuts.map(([a]) => pad(day(a).slice(0, 7), short ? 9 : 10)).join(" ")}`);
for (const s of all) {
  const row = cuts.map(([a, b]) => pad(pct(simulate(coins, s, { from: a, to: b, feePct: fee }).stats.totalPct), short ? 9 : 10));
  console.log(`${s.name.padEnd(30)} ${row.join(" ")}`);
}

// Ventanas de 1 año que empiezan cada 2 semanas: el resultado no puede depender del día en que empiezas.
const win = short ? 91 : 365;
const every = short ? 7 : 14;
const starts = [];
for (let t = from; t + win * DAY <= Date.now(); t += every * DAY) starts.push(t);
if (starts.length > 2) {
  const btcWin = starts.map((a) => simulate(coins, HOLD_BTC, { from: a, to: a + win * DAY, feePct: fee }).stats.totalPct);
  console.log(`\nRobustez: ${starts.length} ventanas de ${short ? "3 meses, empezando cada semana" : "1 año, empezando cada 2 semanas"}`);
  console.log(`${"Estrategia".padEnd(30)} ${pad("Mediana", 10)} ${pad("Peor", 10)} ${pad("Mejor", 10)} ${pad("En +", 7)} ${pad("Gana a BTC", 11)} ${pad("Caída med.", 11)}`);
  for (const s of all) {
    const rs = starts.map((a) => simulate(coins, s, { from: a, to: a + win * DAY, feePct: fee }).stats);
    const tot = rs.map((x) => x.totalPct);
    const sorted = [...tot].sort((x, y) => x - y);
    const dds = rs.map((x) => x.maxDrawdownPct).sort((x, y) => x - y);
    const med = (v) => v[Math.floor(v.length / 2)];
    const beat = tot.filter((v, k) => v > btcWin[k]).length;
    console.log(
      `${s.name.padEnd(30)} ${pad(pct(med(sorted)), 10)} ${pad(pct(sorted[0]), 10)} ${pad(pct(sorted[sorted.length - 1]), 10)} ${pad(`${Math.round((tot.filter((v) => v > 0).length / tot.length) * 100)} %`, 7)} ${pad(`${Math.round((beat / tot.length) * 100)} %`, 11)} ${pad(pct(med(dds)), 11)}`,
    );
  }
}

// Modo en el que está hoy cada agente de dos modos.
const modeNow = CHIP.map((st) => {
  const r = simulate(coins, st, { from: Date.now() - 400 * DAY, feePct: fee });
  return `${st.name}: ${r.lastWeights && Object.keys(r.lastWeights).length ? `ATAQUE (${Object.keys(r.lastWeights).join(", ")})` : "DEFENSA (efectivo)"}`;
});
console.log(`\nHoy:\n  ${modeNow.join("\n  ")}`);
console.log(`\nDetectores: A = Bitcoin sobre sus medias de 200 y 50 días y sin caer más de un 10 % desde su máximo de 30 días.`);
console.log(`            B = Bitcoin sobre sus medias de 200 y 50 días y por encima de su precio de hace 10 días.`);
console.log(`            Si falla una condición, a efectivo (sale rápido); para volver tienen que cumplirse todas (entra con calma).`);
console.log(`\nQué hace cada una:`);
for (const s of all) console.log(`  · ${s.name}: ${s.idea}`);
console.log(`\nSem.+ = semanas en positivo · Caída = peor caída desde un máximo · Invert. = tiempo con dinero dentro.`);
console.log(`Robustez: «En +» = ventanas con ganancia · «Gana a BTC» = ventanas en las que supera a mantener Bitcoin.`);
console.log(`Es historia, no garantía: buscamos algo que gane a mantener Bitcoin con menos caída, y que no dependa de un solo año.\n`);
