// lib/trading/lab/stocks.ts
// Simulación del «enjambre de bolsa» con velas diarias. Puro (sin red): recibe índices y acciones por país.
//  - Radar: fase de cada país con el Detector B sobre su índice (sobre la media de 200 y de 50 días y por encima
//    de hace 10 días). De los que están en ataque, los 3 más fuertes (subida de 63 sesiones) son los operables.
//  - Señal: cierre por encima del máximo de las 20 sesiones anteriores, en una acción de un país operable.
//  - Entrada: al día siguiente a la apertura. 10 huecos, un 10 % del dinero en cada uno.
//  - Salidas «sin codicia»: stop inicial a 2 ATR; vende la mitad a +10 %; el resto con stop que sube a 3 ATR del
//    máximo. En una misma vela, si toca stop y objetivo, cuenta el stop.
//  - Comisión por orden configurable (0,15 % por defecto) y precios en moneda local (sin efecto divisa).
export type DBar = { t: number; o: number; h: number; l: number; c: number };
export type Market = { key: string; name: string; index: DBar[]; stocks: Map<string, DBar[]> };

const DAY = 86_400_000;
const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);

function atr(bars: DBar[], i: number, n = 14) {
  let s = 0;
  for (let k = i - n + 1; k <= i; k++) s += Math.max(bars[k].h - bars[k].l, Math.abs(bars[k].h - bars[k - 1].c), Math.abs(bars[k].l - bars[k - 1].c));
  return s / n;
}

/** Fase y fuerza de cada país por día (con el cierre de ese día: se usa para operar al día siguiente). */
export function radar(markets: Market[]) {
  const out = new Map<string, Map<string, { attack: boolean; strength: number }>>();
  for (const m of markets) {
    const b = m.index;
    const days = new Map<string, { attack: boolean; strength: number }>();
    for (let i = 200; i < b.length; i++) {
      const avg = (n: number) => b.slice(i - n + 1, i + 1).reduce((s, x) => s + x.c, 0) / n;
      const p = b[i].c;
      days.set(dayKey(b[i].t), { attack: p > avg(200) && p > avg(50) && p > b[i - 10].c, strength: p / b[i - 63].c - 1 });
    }
    out.set(m.key, days);
  }
  return out;
}

type Pos = { key: string; country: string; qty: number; entry: number; stop: number; high: number; atr: number; half: boolean; cost: number; opened: string; realized: number };

export function simulateStocks(markets: Market[], from: number, opts: { top?: number; fee?: number; slots?: number; size?: number; startCash?: number } = {}) {
  const top = opts.top ?? 3, fee = opts.fee ?? 0.0015, slots = opts.slots ?? 10, size = opts.size ?? 0.1;
  const startCash = opts.startCash ?? 1000;
  const rad = radar(markets);
  // Calendario: todos los días con datos en algún índice.
  const days = [...new Set(markets.flatMap((m) => m.index.map((b) => dayKey(b.t))))].filter((d) => d >= dayKey(from)).sort();
  const bars = new Map<string, { country: string; bars: DBar[]; at: Map<string, number> }>();
  for (const m of markets) for (const [s, b] of m.stocks) bars.set(`${m.key}:${s}`, { country: m.key, bars: b, at: new Map(b.map((x, i) => [dayKey(x.t), i])) });
  let cash = startCash;
  let pos: Pos[] = [];
  let pending: { key: string; country: string; budget: number }[] = [];
  const trades: { key: string; country: string; pct: number; days: number }[] = [];
  let peak = startCash, maxDd = 0;
  const monthly = new Map<string, { start: number; end: number }>();
  const lastPrice = new Map<string, number>();
  const sell = (p: Pos, qty: number, price: number) => {
    cash += qty * price * (1 - fee);
    p.qty -= qty;
  };
  const finish = (p: Pos, d: string) => {
    trades.push({ key: p.key, country: p.country, pct: (p.cost > 0 ? (p.realized / p.cost - 1) * 100 : 0), days: Math.round((Date.parse(d) - Date.parse(p.opened)) / DAY) });
  };
  for (const d of days) {
    // 1) Órdenes del día anterior: compra a la apertura.
    for (const o of pending) {
      const s = bars.get(o.key)!;
      const i = s.at.get(d);
      if (i === undefined || i < 15) { cash += o.budget; continue; }
      const b = s.bars[i];
      const a = atr(s.bars, i - 1);
      const qty = (o.budget * (1 - fee)) / b.o;
      pos.push({ key: o.key, country: o.country, qty, entry: b.o, stop: b.o - 2 * a, high: b.o, atr: a, half: false, cost: o.budget, opened: d, realized: 0 });
    }
    pending = [];
    // 2) Posiciones con la vela del día.
    const keep: Pos[] = [];
    for (const p0 of pos) {
      const p = p0;
      const s = bars.get(p.key)!;
      const i = s.at.get(d);
      if (i === undefined) { keep.push(p); continue; }
      const b = s.bars[i];
      lastPrice.set(p.key, b.c);
      if (b.l <= p.stop) {
        const px = Math.min(p.stop, b.o);
        p.realized += p.qty * px * (1 - fee);
        sell(p, p.qty, px);
        finish(p, d);
        continue;
      }
      if (!p.half && b.h >= p.entry * 1.1) {
        const px = Math.max(p.entry * 1.1, b.o);
        const q = p.qty / 2;
        p.realized += q * px * (1 - fee);
        sell(p, q, px);
        p.half = true;
        p.stop = Math.max(p.stop, p.entry); // la otra mitad ya no puede perder
      }
      p.high = Math.max(p.high, b.h);
      p.stop = Math.max(p.stop, p.high - 3 * p.atr);
      keep.push(p);
    }
    pos = keep;
    // Valor al cierre.
    let equity = cash + pending.reduce((s, o) => s + o.budget, 0);
    for (const p of pos) equity += p.qty * (lastPrice.get(p.key) ?? p.entry);
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, (peak - equity) / peak);
    const m = d.slice(0, 7);
    const mm = monthly.get(m);
    if (!mm) monthly.set(m, { start: equity, end: equity });
    else mm.end = equity;
    // 3) Radar del día y señales para mañana.
    const ranked = markets
      .map((mk) => ({ key: mk.key, r: rad.get(mk.key)?.get(d) }))
      .filter((x) => x.r?.attack)
      .sort((a, b) => b.r!.strength - a.r!.strength)
      .slice(0, top)
      .map((x) => x.key);
    if (!ranked.length) continue;
    const held = new Set(pos.map((p) => p.key));
    const signals: { key: string; country: string; push: number }[] = [];
    for (const [key, s] of bars) {
      if (!ranked.includes(s.country) || held.has(key)) continue;
      const i = s.at.get(d);
      if (i === undefined || i < 21) continue;
      const prevHigh = Math.max(...s.bars.slice(i - 20, i).map((x) => x.h));
      if (s.bars[i].c > prevHigh) signals.push({ key, country: s.country, push: s.bars[i].c / prevHigh - 1 });
    }
    signals.sort((a, b) => b.push - a.push);
    for (const sg of signals) {
      if (pos.length + pending.length >= slots) break;
      const budget = Math.min(cash, equity * size);
      if (budget < 10) break;
      cash -= budget;
      pending.push({ key: sg.key, country: sg.country, budget });
    }
  }
  // Cierre final.
  const end = days[days.length - 1];
  for (const p0 of pos) {
    const p = p0;
    const px = lastPrice.get(p.key) ?? p.entry;
    p.realized += p.qty * px * (1 - fee);
    sell(p, p.qty, px);
    finish(p, end);
  }
  for (const o of pending) cash += o.budget;
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  const wins = trades.filter((x) => x.pct > 0);
  const losses = trades.filter((x) => x.pct <= 0);
  const yearly = new Map<string, { start: number; end: number }>();
  for (const [m, v] of monthly) {
    const y = m.slice(0, 4);
    const yy = yearly.get(y);
    if (!yy) yearly.set(y, { start: v.start, end: v.end });
    else yy.end = v.end;
  }
  // Días en ataque de cada país dentro del periodo.
  const attackPct = Object.fromEntries(markets.map((mk) => {
    const xs = days.map((d) => rad.get(mk.key)?.get(d)).filter(Boolean);
    return [mk.key, xs.length ? Math.round((xs.filter((x) => x!.attack).length / xs.length) * 100) : null];
  }));
  return {
    final: r2(cash),
    returnPct: r2((cash / startCash - 1) * 100),
    maxDrawdownPct: r2(maxDd * 100),
    trades: trades.length,
    winRatePct: r2((wins.length / Math.max(1, trades.length)) * 100),
    avgWinPct: r2(avg(wins.map((x) => x.pct))),
    avgLossPct: r2(avg(losses.map((x) => x.pct))),
    avgDays: r2(avg(trades.map((x) => x.days))),
    byCountry: markets.map((mk) => {
      const xs = trades.filter((x) => x.country === mk.key);
      return { country: mk.key, trades: xs.length, avgPct: r2(avg(xs.map((x) => x.pct))), attackPct: attackPct[mk.key] };
    }),
    yearly: [...yearly.entries()].map(([y, v]) => ({ y, pct: r2((v.end / v.start - 1) * 100) })),
    monthly: [...monthly.entries()].map(([m, v]) => ({ m, pct: r2((v.end / v.start - 1) * 100) })),
  };
}
