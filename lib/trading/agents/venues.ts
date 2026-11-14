// lib/trading/agents/venues.ts
// Universo de cada agente y en qué exchanges se le puede copiar (las pills «Crypto / Valores» y
// «Bitvavo · Coinbase 10/12…»). Las listas de monedas de cada exchange son públicas (sin clave) y casi
// no cambian: se guardan unas horas. Si un exchange no responde, su pill no sale (no se inventa).
import "server-only";
import { prisma } from "@/lib/prisma";
import { brokerRegistry } from "@/lib/brokers/providers";
import { parseProducts } from "@/lib/brokers/adapters/coinbase/mapping";
import { CRYPTO_MARKET } from "../market-data";
import { eurPairs } from "../kamikaze/market";
import { isKamikaze } from "../kamikaze/roster";
import { isChip } from "../chip/roster";
import { marketsOf, venuesFor, type AgentMarket, type AgentUniverse, type Venue, type VenueFit } from "./venues-logic";

const TTL = 6 * 60 * 60_000;
let cache: { at: number; value: Promise<Snapshot> } | null = null;

type Snapshot = { venues: Venue[]; crypto: string[]; bolsa: string[]; kamikaze: string[] };

const baseOf = (symbol: string) => symbol.toUpperCase().replace(/-EUR$/, "");

async function getJson(url: string) {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8_000), headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${url}: error ${res.status}`);
  return res.json() as Promise<unknown>;
}

async function bitvavoCoins(): Promise<Set<string>> {
  const rows = (await getJson("https://api.bitvavo.com/v2/markets")) as { base?: string; quote?: string; status?: string }[];
  return new Set(rows.filter((m) => m.quote === "EUR" && m.status === "trading" && m.base).map((m) => m.base!.toUpperCase()));
}

async function coinbaseCoins(): Promise<Set<string>> {
  const products = parseProducts(await getJson("https://api.coinbase.com/api/v3/brokerage/market/products?product_type=SPOT"));
  return new Set([...products.values()].filter((p) => p.trading && (p.quote === "EUR" || p.quote === "USDC") && p.base !== "USDC").map((p) => p.base.toUpperCase()));
}

async function binanceCoins(): Promise<Set<string>> {
  // Pares contra euros y contra USDC (en la UE no hay USDT al contado).
  return new Set([...(await eurPairs()).values()].filter((r) => r.base !== "EUR" && r.base !== "USDC").map((r) => r.base.toUpperCase()));
}

/** Listo para dinero real si el adaptador está y anuncia el entorno real. */
const readyOf = (id: string) => brokerRegistry.has(id) && brokerRegistry.get(id).info.environments.includes("real");
const nameOf = (id: string, fallback: string) => brokerRegistry.list().find((p) => p.id === id)?.name ?? fallback;

async function load(): Promise<Snapshot> {
  async function settled<T>(p: Promise<T>): Promise<T | null> {
    try {
      return await p;
    } catch (e) {
      console.error("[trading] lista de monedas", e);
      return null;
    }
  }
  const [bitvavo, coinbase, binance, instruments] = await Promise.all([
    settled(bitvavoCoins()),
    settled(coinbaseCoins()),
    settled(binanceCoins()),
    prisma.market_instruments.findMany({ where: { active: true }, select: { symbol: true, market: true } }),
  ]);
  const venues: Venue[] = [];
  if (bitvavo) venues.push({ id: "bitvavo", name: nameOf("bitvavo", "Bitvavo"), market: "crypto", ready: readyOf("bitvavo"), has: bitvavo });
  if (coinbase) venues.push({ id: "coinbase", name: nameOf("coinbase", "Coinbase"), market: "crypto", ready: readyOf("coinbase"), has: coinbase });
  if (binance) venues.push({ id: "binance", name: nameOf("binance", "Binance"), market: "crypto", ready: readyOf("binance"), has: binance });
  // Trading 212 tiene las acciones del IBEX; su lista de valores pide clave, así que se da por hecho.
  if (brokerRegistry.list().some((p) => p.id === "trading212")) venues.push({ id: "trading212", name: nameOf("trading212", "Trading 212"), market: "bolsa", ready: readyOf("trading212"), has: null });
  // Universo de los kamikazes y FARO: monedas de Binance (euros/USDC) que también están en Bitvavo.
  const kamikaze = binance ? [...binance].filter((b) => !bitvavo || bitvavo.has(b)).sort() : [];
  return {
    venues,
    crypto: instruments.filter((i) => i.market === CRYPTO_MARKET).map((i) => baseOf(i.symbol)),
    bolsa: instruments.filter((i) => i.market !== CRYPTO_MARKET).map((i) => i.symbol),
    kamikaze,
  };
}

async function snapshot() {
  if (!cache || Date.now() - cache.at > TTL) {
    const value = load();
    cache = { at: Date.now(), value };
    value.catch(() => (cache = null));
  }
  return cache.value;
}

export type AgentVenues = { markets: AgentMarket[]; venues: VenueFit[] };

/** Universo de un agente según su tipo: clásicos (bolsa y crypto), CAMALEÓN (crypto fijo) y kamikazes (crypto dinámico). */
function universeOf(key: string, s: Snapshot): AgentUniverse {
  if (isKamikaze(key)) return { crypto: s.kamikaze, bolsa: [] };
  if (isChip(key)) return { crypto: s.crypto, bolsa: [] };
  return { crypto: s.crypto, bolsa: s.bolsa };
}

/** Pills de cada agente. Si algo falla, null (la tarjeta sale sin pills, no rota). */
export async function agentVenues(keys: string[]): Promise<Map<string, AgentVenues> | null> {
  try {
    const s = await snapshot();
    return new Map(
      keys.map((k) => {
        const u = universeOf(k, s);
        return [k, { markets: marketsOf(u), venues: venuesFor(u, s.venues) }] as const;
      }),
    );
  } catch (e) {
    console.error("[trading] exchanges de los agentes", e);
    return null;
  }
}
