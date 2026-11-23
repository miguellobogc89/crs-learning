// lib/trading/agents/references.ts
// Referencias para comparar a los agentes (no son agentes): qué habría pasado sin hacer nada inteligente,
// desde el mismo día en que empezaron ellos.
//   - Bitcoin guardado: comprarlo el primer día y no tocarlo.
//   - Bitcoin cada día (DCA): comprar la misma cantidad cada día, pase lo que pase.
// Puro: lo usan el servidor y los tests.

export type Reference = { key: "btc-hold" | "btc-dca"; name: string; description: string; returnPct: number | null; days: number };

/** Cierres diarios (t en ms, c en €) desde `since`, y el precio de ahora si lo hay (sustituye al de hoy). */
export function btcReferences(candles: { t: number; c: number }[], since: number, livePrice: number | null = null): Reference[] {
  const DAY = 86_400_000;
  const day = (t: number) => Math.floor(t / DAY) * DAY;
  const list = candles.filter((x) => x.c > 0 && day(x.t) >= day(since)).sort((a, b) => a.t - b.t);
  const last = livePrice ?? list[list.length - 1]?.c ?? null;
  const days = list.length;
  const hold = list.length && last ? ((last - list[0].c) / list[0].c) * 100 : null;
  // Misma cantidad cada día: unidades = Σ 1/precio; valor = unidades × precio de ahora; invertido = n.
  const units = list.reduce((s, x) => s + 1 / x.c, 0);
  const dca = list.length && last ? ((units * last) / list.length - 1) * 100 : null;
  return [
    { key: "btc-hold", name: "Bitcoin guardado", description: "Comprar Bitcoin el primer día y no tocarlo.", returnPct: hold, days },
    { key: "btc-dca", name: "Bitcoin cada día", description: "Comprar la misma cantidad de Bitcoin cada día, pase lo que pase (DCA).", returnPct: dca, days },
  ];
}
