// lib/trading/agents/venues-logic.ts
// Qué opera cada agente (crypto, valores o los dos) y en qué exchanges se le puede copiar. Se calcula
// sobre su UNIVERSO (las monedas y valores que mira y puede comprar), no sobre lo que tiene ahora: lo
// que tiene cambia cada día; su universo, no. Puro: lo usan el servidor, la interfaz y los tests.

export type AgentMarket = "crypto" | "bolsa";

/** Lo que mira un agente: monedas (BTC, ETH…) y valores (IBE.MC…). */
export type AgentUniverse = { crypto: string[]; bolsa: string[] };

/** Un exchange o bróker y lo que tiene: monedas que se compran en euros o USDC, o valores de bolsa. */
export type Venue = {
  id: string;
  name: string;
  market: AgentMarket;
  /** Se puede conectar ya con dinero real (si no, se enseña en gris: «Pronto» o solo de pruebas). */
  ready: boolean;
  /** Lo que tiene (monedas o valores). null = no se sabe la lista: se da por hecho que tiene todo. */
  has: Set<string> | null;
};

export type VenueFit = {
  id: string;
  name: string;
  market: AgentMarket;
  ready: boolean;
  /** Del universo del agente en ese mercado, cuántos tiene el exchange. */
  covered: number;
  total: number;
  /** all: puedes copiar todo lo de ese mercado; partial: parte (las demás operaciones se saltan). */
  fit: "all" | "partial";
};

export const marketsOf = (u: AgentUniverse): AgentMarket[] => [...(u.crypto.length ? (["crypto"] as const) : []), ...(u.bolsa.length ? (["bolsa"] as const) : [])];

/** Exchanges con los que se puede copiar algo del agente, ordenados: listos primero y de más a menos cobertura. */
export function venuesFor(u: AgentUniverse, venues: Venue[]): VenueFit[] {
  const out: VenueFit[] = [];
  for (const v of venues) {
    const list = v.market === "crypto" ? u.crypto : u.bolsa;
    if (!list.length) continue;
    const covered = v.has ? list.filter((s) => v.has!.has(s.toUpperCase())).length : list.length;
    if (!covered) continue;
    out.push({ id: v.id, name: v.name, market: v.market, ready: v.ready, covered, total: list.length, fit: covered === list.length ? "all" : "partial" });
  }
  return out.sort((a, b) => Number(b.ready) - Number(a.ready) || b.covered / b.total - a.covered / a.total || a.name.localeCompare(b.name));
}

/** Texto de la pill: «Bitvavo», o «Coinbase 10/12» si solo tiene parte. */
export const venueLabel = (f: VenueFit) => (f.fit === "all" ? f.name : `${f.name} ${f.covered}/${f.total}`);

export const MARKET_LABEL: Record<AgentMarket, string> = { crypto: "Crypto", bolsa: "Valores" };
