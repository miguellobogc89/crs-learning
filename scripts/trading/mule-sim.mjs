// scripts/trading/mule-sim.mjs
// ¿Funcionaría «la mula»? (buscar +1 % al día, asegurarlo y parar hasta mañana)
// Simula la regla sobre el historial real de ideas de FARO con velas de 5 min de Binance.
// Solo LEE: la base de datos (trading_faro_ideas) y datos públicos de Binance. No escribe nada ni opera.
//
// Uso (en tu PC, desde la carpeta del proyecto):
//   node --env-file=.env scripts/trading/mule-sim.mjs            (comisión 0,5 % por operación completa)
//   node --env-file=.env scripts/trading/mule-sim.mjs --cost 0.3

const BINANCE = "https://data-api.binance.vision";
const MIN5 = 5 * 60_000;

// ---------------------------------------------------------------------------
// Simulación pura (sin red): exportada para probarla
// ---------------------------------------------------------------------------
/**
 * Recorre las velas desde la entrada. Devuelve el % bruto de salida y el motivo.
 * mode "fijo": sale en +target o en −stop (si una vela toca ambos, cuenta el stop: conservador).
 * mode "asegura": al tocar +target sube el stop a +target y deja correr hasta el final del tramo.
 * Si no toca nada, sale al cierre de la última vela (fin del día).
 */
export function runTrade(bars, entry, target, stop, mode = "fijo") {
  const up = entry * (1 + target / 100);
  let sl = entry * (1 - stop / 100);
  let locked = false;
  for (const b of bars) {
    const [t, open, high, low] = b;
    // Hueco: abre ya por debajo del stop → sale a la apertura.
    if (open <= sl) return { pct: (open / entry - 1) * 100, why: locked ? "asegurado" : "stop", t };
    if (!locked && open >= up) {
      if (mode === "fijo") return { pct: (open / entry - 1) * 100, why: "objetivo", t };
      locked = true;
      sl = up;
    }
    const hitStop = low <= sl;
    const hitTarget = !locked && high >= up;
    if (hitStop) return { pct: (sl / entry - 1) * 100, why: locked ? "asegurado" : "stop", t };
    if (hitTarget) {
      if (mode === "fijo") return { pct: target, why: "objetivo", t };
      locked = true;
      sl = up;
    }
  }
  const last = bars[bars.length - 1];
  return { pct: last ? (last[4] / entry - 1) * 100 : 0, why: locked ? "asegurado" : "fin del día", t: last ? last[0] : null };
}

/** Fin del día en Madrid (00:00 del día siguiente) para un instante dado. */
export function madridDayEnd(ms) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
  // Medianoche siguiente en Madrid: se busca el primer instante cuyo día ya no es `day`.
  let t = Date.parse(`${day}T22:00:00Z`) - 3 * 3_600_000;
  while (new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t)) === day) t += 15 * 60_000;
  return { day, end: t };
}

/** La mula: por cada día, ideas en orden sin solaparse; para al llegar a +target del día o a −dayLoss. */
export function muleDays(trades, target, dayLoss) {
  const byDay = new Map();
  for (const tr of trades) {
    const list = byDay.get(tr.day) ?? [];
    list.push(tr);
    byDay.set(tr.day, list);
  }
  const days = [];
  for (const [day, list] of [...byDay.entries()].sort()) {
    let eq = 1;
    let busyUntil = 0;
    let n = 0;
    for (const tr of list.sort((a, b) => a.at - b.at)) {
      if (tr.at < busyUntil) continue;
      eq *= 1 + tr.net / 100;
      busyUntil = tr.exitAt ?? Infinity;
      n++;
      const dayPct = (eq - 1) * 100;
      if (dayPct >= target || dayPct <= -dayLoss) break;
    }
    days.push({ day, pct: (eq - 1) * 100, trades: n });
  }
  return days;
}

// ---------------------------------------------------------------------------
// Datos
// ---------------------------------------------------------------------------
async function klines(pair, start, end) {
  const out = [];
  let from = start;
  while (from < end) {
    const q = new URLSearchParams({ symbol: pair, interval: "5m", startTime: String(from), endTime: String(end), limit: "1000" });
    const res = await fetch(`${BINANCE}/api/v3/klines?${q}`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`Binance ${res.status} en ${pair}`);
    const rows = await res.json();
    if (!rows.length) break;
    for (const r of rows) out.push([r[0], +r[1], +r[2], +r[3], +r[4]]);
    from = rows[rows.length - 1][0] + MIN5;
    if (rows.length < 1000) break;
  }
  return out;
}

function connString(raw) {
  const url = new URL(raw);
  const mode = url.searchParams.get("sslmode")?.toLowerCase();
  if (mode === "require" || mode === "prefer" || mode === "verify-ca") url.searchParams.set("sslmode", "verify-full");
  return url.toString();
}

const pctf = (v, d = 2) => `${v >= 0 ? "+" : ""}${v.toFixed(d).replace(".", ",")} %`;
const pad = (s, n) => String(s).padEnd(n);

async function main() {
  const cost = Number(process.argv[process.argv.indexOf("--cost") + 1]) || 0.5;
  if (!process.env.DATABASE_URL) throw new Error("Falta DATABASE_URL: ejecuta con  node --env-file=.env scripts/trading/mule-sim.mjs");
  const { default: pg } = await import("pg");
  const db = new pg.Client({ connectionString: connString(process.env.DATABASE_URL) });
  await db.connect();
  const { rows } = await db.query(`SELECT id, pair, kind, created_at FROM trading_faro_ideas ORDER BY created_at`);
  await db.end();
  if (!rows.length) return console.log("FARO aún no tiene ideas en la base de datos.");

  const now = Date.now();
  console.log(`Ideas de FARO: ${rows.length} (desde ${rows[0].created_at.toISOString().slice(0, 16)})`);
  console.log(`Comisión supuesta: ${String(cost).replace(".", ",")} % por operación completa (compra + venta)\n`);

  // Velas de cada idea, desde su publicación hasta el final de ese día en Madrid.
  const items = [];
  for (const [i, r] of rows.entries()) {
    const at = new Date(r.created_at).getTime();
    const { day, end } = madridDayEnd(at);
    try {
      const bars = (await klines(r.pair, at, Math.min(end, now))).filter((b) => b[0] >= at);
      if (bars.length) items.push({ ...r, at, day, bars, entry: bars[0][1] });
    } catch (e) {
      console.log(`  (sin velas para ${r.pair}: ${e.message})`);
    }
    if (i % 20 === 19) process.stdout.write(`  …${i + 1}/${rows.length} ideas\n`);
    await new Promise((res) => setTimeout(res, 120));
  }
  console.log(`Ideas con velas: ${items.length}\n`);

  const grid = [];
  for (const mode of ["fijo", "asegura"]) {
    for (const target of [1, 1.5, 2]) {
      for (const stop of [1, 1.5, 2, 3]) {
        const trades = items.map((it) => {
          const r = runTrade(it.bars, it.entry, target, stop, mode);
          return { day: it.day, at: it.at, exitAt: r.t, gross: r.pct, net: r.pct - cost, why: r.why };
        });
        const wins = trades.filter((t) => t.net > 0).length;
        const avg = trades.reduce((s, t) => s + t.net, 0) / trades.length;
        const days = muleDays(trades, 1, 2);
        const goodDays = days.filter((d) => d.pct > 0).length;
        const total = (days.reduce((e, d) => e * (1 + d.pct / 100), 1) - 1) * 100;
        grid.push({ mode, target, stop, n: trades.length, winPct: (wins / trades.length) * 100, avg, days: days.length, goodDays, total });
      }
    }
  }

  console.log("Por operación (cada idea por separado) y por día (la mula: para al +1 % del día o al −2 %):\n");
  console.log(`${pad("Regla", 10)}${pad("Objetivo", 10)}${pad("Stop", 8)}${pad("Aciertos", 11)}${pad("Media/op.", 12)}${pad("Días +", 10)}${pad("Total", 10)}`);
  for (const g of grid) {
    console.log(
      `${pad(g.mode, 10)}${pad(`+${g.target} %`, 10)}${pad(`−${g.stop} %`, 8)}${pad(`${g.winPct.toFixed(0)} %`, 11)}${pad(pctf(g.avg), 12)}${pad(`${g.goodDays}/${g.days}`, 10)}${pad(pctf(g.total, 1), 10)}`,
    );
  }
  const best = [...grid].sort((a, b) => b.total - a.total)[0];
  console.log(`\nMejor combinación: ${best.mode}, objetivo +${best.target} %, stop −${best.stop} % → ${pctf(best.total, 1)} en ${best.days} días (${best.goodDays} días en positivo).`);
  console.log("Ojo: pocas semanas de datos son una muestra pequeña; elegir «la mejor» a posteriori la sobrevalora.");
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("mule-sim.mjs")) {
  main().catch((e) => {
    console.error("Error:", e.message);
    process.exit(1);
  });
}
