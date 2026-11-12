// scripts/trading/mula-rebotes.mjs
// ¿Funcionaría MULA (rebotes en tendencia)? Simula sus reglas sobre el último año (o los que digas)
// con velas diarias públicas de Binance en euros. Solo LEE datos públicos: no toca la base de datos ni opera.
//
// Uso (en tu PC, desde la carpeta del proyecto):
//   node scripts/trading/mula-rebotes.mjs              (último año)
//   node scripts/trading/mula-rebotes.mjs --years 3
//   node scripts/trading/mula-rebotes.mjs --fee 0.15   (comisión por orden, %)
import { load } from "../../tests/trading/helpers.mjs";

const { runMula, MULA_DEFAULT, MULA_GRID } = load("lib/trading/mula/backtest.ts");
const BINANCE = "https://data-api.binance.vision";
const COINS = ["BTC", "ETH", "SOL", "XRP", "BNB", "ADA", "DOGE", "AVAX", "DOT", "LINK", "LTC", "TRX"];
const arg = (name, def) => {
  const k = process.argv.indexOf(`--${name}`);
  return k > 0 ? Number(process.argv[k + 1]) : def;
};
const years = arg("years", 1);
const fee = arg("fee", MULA_DEFAULT.feePct);

async function klines(pair, days) {
  const out = [];
  let start = Date.now() - days * 86_400_000;
  while (start < Date.now()) {
    const q = new URLSearchParams({ symbol: pair, interval: "1d", startTime: String(start), limit: "1000" });
    const res = await fetch(`${BINANCE}/api/v3/klines?${q}`, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`${pair}: ${res.status}`);
    const rows = await res.json();
    if (!rows.length) break;
    for (const r of rows) out.push({ t: r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] });
    start = rows[rows.length - 1][0] + 86_400_000;
    if (rows.length < 1000) break;
  }
  return out;
}

const pct = (v, d = 1) => (v === null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(d).replace(".", ",")} %`);
const day = (t) => new Date(t).toISOString().slice(0, 10);

const warmup = 80; // días para las medias antes de empezar
const input = [];
for (const c of COINS) {
  try {
    const candles = await klines(`${c}EUR`, Math.round(years * 365) + warmup);
    // La vela de hoy aún no ha cerrado: fuera.
    if (candles.length && candles[candles.length - 1].t > Date.now() - 86_400_000) candles.pop();
    input.push({ symbol: `${c}-EUR`, candles });
  } catch (e) {
    console.log(`(sin datos de ${c}: ${e.message})`);
  }
}
const from = Date.now() - Math.round(years * 365) * 86_400_000;

const main = runMula(input, { ...MULA_DEFAULT, feePct: fee }, from);
const s = main.stats;
console.log(`\nMULA · rebotes en tendencia · ${day(main.from)} → ${day(main.to)} · ${input.length} monedas · comisión ${fee} % por orden\n`);
console.log(`Reglas: objetivo +${main.params.tpPct} % · stop −${main.params.slPct} % · máx. ${main.params.maxDays} días · RSI < ${main.params.rsiMax} o ${main.params.downDays} días bajando · solo sobre su media de 50 días`);
console.log(`
  Rentabilidad total ........ ${pct(s.totalPct)}   (mantener Bitcoin: ${pct(s.btcPct)})
  Media por semana .......... ${pct(s.weeklyPct, 2)}
  Semanas en positivo ....... ${s.positiveWeeksPct.toFixed(0)} %
  Operaciones ............... ${s.trades}  (acierto ${s.winRate.toFixed(0)} %)
  Mejor / peor operación .... ${pct(s.bestTradePct)} / ${pct(s.worstTradePct)}
  Peor caída desde máximo ... ${pct(s.maxDrawdownPct)}
  Tiempo invertido .......... ${s.exposurePct.toFixed(0)} %
`);
const reasons = main.trades.reduce((m, t) => ((m[t.reason] = (m[t.reason] ?? 0) + 1), m), {});
console.log(`  Salidas: ${Object.entries(reasons).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
console.log(`  Últimas operaciones:`);
for (const t of main.trades.slice(-8)) console.log(`    ${day(t.entryDay)} ${t.symbol.padEnd(9)} ${t.reason.padEnd(9)} ${pct(t.netPct)}`);

console.log(`\nVariantes (si solo funciona una, es casualidad):`);
for (const g of MULA_GRID) {
  const r = runMula(input, { ...MULA_DEFAULT, ...g, feePct: fee }, from).stats;
  const p = { ...MULA_DEFAULT, ...g };
  console.log(
    `  +${p.tpPct}/−${p.slPct} ${p.maxDays}d  total ${pct(r.totalPct).padStart(9)} · semana ${pct(r.weeklyPct, 2).padStart(8)} · ${r.trades} op. · acierto ${r.winRate.toFixed(0)} % · peor caída ${pct(r.maxDrawdownPct)}`,
  );
}
console.log("\nEs historia, no garantía: sirve para decidir si merece la pena ponerla a operar en virtual.\n");
