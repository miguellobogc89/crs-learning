// lib/trading/dca/roster.ts
// Agentes de referencia: no miran el mercado ni a FARO. Compran la misma cantidad cada semana pase lo que
// pase (DCA, «compra periódica») y no venden nunca. Sirven de vara de medir: un agente que no gane a
// esto no está aportando nada. Puro: lo usan el servidor, los tests y la interfaz.
import type { AgentRules } from "../agents/roster";

export type DcaDef = {
  key: string;
  name: string;
  profile: "dca";
  tagline: string;
  /** Qué compra (símbolo de CRS) y su par de Binance para el precio del momento. */
  symbol: string;
  pair: string;
  /** Capital total y cuánto compra cada semana (hasta gastarlo). */
  capital: number;
  amount: number;
  /** Día de compra (0 = domingo … 1 = lunes), en hora de Madrid. */
  weekday: number;
  color: string;
  settings: {
    risk_per_trade_pct: number;
    max_position_pct: number;
    max_open_positions: number;
    commission_pct: number;
    commission_min: number;
    slippage_bps: number;
    breakeven: boolean;
  };
  rules: AgentRules;
};

export const DCA_AGENTS: DcaDef[] = [
  {
    key: "hormiga",
    name: "HORMIGA",
    profile: "dca",
    tagline: "Compra 50 € de Bitcoin cada lunes, pase lo que pase, y no vende nunca. Es la vara de medir: si un agente no le gana, no aporta.",
    symbol: "BTC-EUR",
    pair: "BTCEUR",
    capital: 1000,
    amount: 50,
    weekday: 1,
    color: "slate",
    // Como un exchange de crypto al contado (Bitvavo): ~0,25 % por orden.
    settings: { commission_pct: 0.25, commission_min: 0, slippage_bps: 5, risk_per_trade_pct: 100, max_position_pct: 100, max_open_positions: 60, breakeven: false },
    rules: { maxBuys: 1, minConviction: 1, minRewardRisk: 1, buyInBearMarket: true },
  },
];

export const dcaByKey = (key: string) => DCA_AGENTS.find((d) => d.key === key) ?? null;
export const isDca = (key: unknown): key is string => typeof key === "string" && DCA_AGENTS.some((d) => d.key === key);

/** Semana (lunes, en hora de Madrid) de un instante: «2026-11-16». Una compra por semana como mucho. */
export function weekOf(t: number) {
  const madrid = new Date(new Date(t).toLocaleString("en-US", { timeZone: "Europe/Madrid" }));
  const dow = (madrid.getDay() + 6) % 7; // lunes = 0
  madrid.setDate(madrid.getDate() - dow);
  const y = madrid.getFullYear();
  const m = String(madrid.getMonth() + 1).padStart(2, "0");
  const d = String(madrid.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * ¿Toca comprar? Una vez por semana: el día de compra o después (si ese día no se pudo), y la primera
 * semana nada más empezar. Nunca si ya compró esa semana o no le queda para una compra entera.
 */
export function dcaDue(s: { now: number; weekday: number; boughtWeeks: Set<string>; firstWeek: string | null; cash: number; amount: number }) {
  const week = weekOf(s.now);
  if (s.boughtWeeks.has(week)) return null;
  if (s.cash < s.amount * 0.98) return null;
  const madrid = new Date(new Date(s.now).toLocaleString("en-US", { timeZone: "Europe/Madrid" }));
  const dow = (madrid.getDay() + 6) % 7;
  const due = (s.weekday + 6) % 7;
  if (s.firstWeek === null || week === s.firstWeek || dow >= due) return week;
  return null;
}
