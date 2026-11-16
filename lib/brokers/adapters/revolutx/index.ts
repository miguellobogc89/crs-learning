// lib/brokers/adapters/revolutx/index.ts
// Revolut X: el exchange de criptomonedas de Revolut (Europa, licencia MiCA). Compraventa al contado en
// pares contra euros, con órdenes a mercado y limitadas. La API no tiene retiradas: la clave solo puede
// leer y operar. Comisiones: 0 % maker y 0,09 % taker (las copias compran al momento: 0,09 %).
import { createHash } from "node:crypto";
import type { AdapterOrder, BrokerAdapter, BrokerSession } from "../../adapter";
import type { BrokerAccount, BrokerInstrument, BrokerOrder, BrokerPosition, OrderStatus, ProviderInfo } from "../../types";
import { createApi, ID, revxError, type ApiDeps } from "./api";

const EUR = "EUR";

export const REVOLUTX_INFO: ProviderInfo = {
  id: ID,
  name: "Revolut X",
  logo: "https://www.google.com/s2/favicons?domain=revolut.com&sz=64",
  description: "Criptomonedas al contado contra euros, con las comisiones más bajas (0 % / 0,09 %). Conecta tu cuenta de Revolut X.",
  availability: "available",
  environments: ["real"],
  markets: ["crypto"],
  capabilities: ["accounts", "positions", "orders", "instruments", "place_order", "order_status", "cancel_order"],
  orderTypes: ["market", "limit"],
  credentialFields: [
    {
      key: "apiKey",
      label: "Clave de API",
      secret: true,
      help: "En Revolut X (web) → Perfil → API: crea una clave subiendo tu clave pública Ed25519. Es una cadena de 64 caracteres.",
    },
    {
      key: "privateKey",
      label: "Clave privada (Ed25519)",
      secret: true,
      help: "El contenido de private.pem (el bloque «-----BEGIN PRIVATE KEY-----» completo). Se genera con: openssl genpkey -algorithm ed25519 -out private.pem",
    },
  ],
  notes: [
    "La API de Revolut X no permite retiradas: la clave solo puede ver tu cuenta y comprar o vender.",
    "Solo compraventa al contado en pares contra EUR, con órdenes a mercado o limitadas.",
    "Necesitas euros en tu cuenta de Revolut X (no en la cuenta normal de Revolut).",
  ],
  fees: { maker: 0, taker: 0.09, source: "revolut.com/legal/crypto-exchange-fees" },
};

type Row = Record<string, unknown>;
type Pair = { symbol: string; base: string; step: string; min: number; minQuote: number };

const str = (x: unknown) => (typeof x === "string" ? x : typeof x === "number" ? String(x) : "");
const num = (x: unknown) => {
  const raw = str(x).trim();
  const n = Number(raw);
  return raw && Number.isFinite(n) ? n : null;
};
const rows = (x: unknown): Row[] => {
  const list = Array.isArray(x) ? x : x && typeof x === "object" && Array.isArray((x as { data?: unknown }).data) ? (x as { data: unknown[] }).data : [];
  return list.filter((r): r is Row => !!r && typeof r === "object" && !Array.isArray(r));
};
const one = (x: unknown): Row | null => {
  if (!x || typeof x !== "object") return null;
  const d = (x as { data?: unknown }).data;
  if (d && typeof d === "object" && !Array.isArray(d)) return d as Row;
  return x as Row;
};

/** El identificador de CRS en formato UUID (Revolut X lo exige así): siempre el mismo para la misma orden. */
export function clientUuid(id: string) {
  const h = createHash("sha256").update(id).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h[16], 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const STATUS: Record<string, OrderStatus> = {
  pending_new: "open",
  new: "open",
  partially_filled: "partially_filled",
  filled: "filled",
  cancelled: "cancelled",
  rejected: "rejected",
  replaced: "cancelled",
};

function parseOrder(row: Row): BrokerOrder {
  const side = str(row.side);
  if (side !== "buy" && side !== "sell") throw revxError("provider_unavailable", "Revolut X devolvió una orden no válida.");
  const symbol = str(row.symbol).replace("/", "-");
  const quantity = num(row.quantity) ?? num(row.filled_quantity) ?? 0;
  return {
    orderId: str(row.id) || str(row.venue_order_id),
    symbol: symbol.endsWith(`-${EUR}`) ? symbol : null,
    providerSymbol: symbol,
    side,
    type: str(row.type) === "limit" ? "limit" : "market",
    status: STATUS[str(row.status)] ?? "unknown",
    providerStatus: str(row.status) || null,
    quantity,
    filledQuantity: num(row.filled_quantity),
    limitPrice: num(row.price),
    stopPrice: null,
    averageFillPrice: num(row.average_fill_price),
    createdByApi: true,
    createdAt: num(row.created_date) ? new Date(num(row.created_date)!).toISOString() : null,
  };
}

/** Cantidad ajustada al paso del par (siempre hacia abajo) y como texto decimal. */
function sized(quantity: number, pair: Pair) {
  const step = Number(pair.step);
  const decimals = (pair.step.split(".")[1] ?? "").replace(/0+$/, "").length;
  const steps = Math.floor(quantity / step + 1e-9);
  if (!(steps > 0)) throw revxError("invalid_request", "Cantidad demasiado pequeña para Revolut X.");
  const size = (steps * step).toFixed(Math.min(decimals, 18));
  if (Number(size) < pair.min) throw revxError("invalid_request", `La cantidad mínima de ${pair.symbol} en Revolut X es ${pair.min}.`);
  return size;
}

export function createRevolutXAdapter(deps: ApiDeps = { fetch: (input, init) => fetch(input, init), now: Date.now }): BrokerAdapter {
  const api = createApi(deps);
  let catalog: { until: number; pairs: Map<string, Pair> } | null = null;

  /** Pares activos contra euros (configuración pública), una hora en memoria. */
  async function pairs() {
    if (catalog && catalog.until > deps.now()) return catalog.pairs;
    const raw = await api("GET", "/public/configuration/pairs", null, { query: { region: "EEA" } });
    const data = raw && typeof raw === "object" ? (((raw as { data?: unknown }).data ?? raw) as Record<string, unknown>) : {};
    const out = new Map<string, Pair>();
    for (const [code, v] of Object.entries(data)) {
      if (!v || typeof v !== "object") continue;
      const p = v as Row;
      const base = str(p.base) || code.split("/")[0];
      const quote = str(p.quote) || code.split("/")[1];
      if (quote !== EUR || str(p.status) !== "active" || !(num(p.base_step) ?? 0)) continue;
      const symbol = `${base}-${EUR}`;
      out.set(symbol, { symbol, base, step: str(p.base_step), min: num(p.min_order_size) ?? 0, minQuote: num(p.min_order_size_quote) ?? 0 });
    }
    catalog = { until: deps.now() + 60 * 60_000, pairs: out };
    return out;
  }

  /** Precio medio de ahora de cada par contra euros. */
  async function prices() {
    const raw = await api("GET", "/public/tickers", null, { query: { region: "EEA" } });
    const out = new Map<string, number>();
    for (const t of rows(raw)) {
      const sym = str(t.symbol).replace("/", "-");
      const p = num(t.mid) ?? num(t.last_price) ?? num(t.last);
      if (sym && p && p > 0) out.set(sym, p);
    }
    return out;
  }

  async function snapshot(s: BrokerSession): Promise<{ account: BrokerAccount; positions: BrokerPosition[] }> {
    const [balances, px] = await Promise.all([api("GET", "/balances", s), prices().catch(() => new Map<string, number>())]);
    if (!Array.isArray(balances) && !(balances && typeof balances === "object" && Array.isArray((balances as { data?: unknown }).data))) {
      throw revxError("provider_unavailable", "Revolut X no devolvió los saldos.");
    }
    const list = rows(balances);
    let cashAvailable = 0;
    let cashTotal = 0;
    let invested = 0;
    const positions: BrokerPosition[] = [];
    for (const b of list) {
      const currency = str(b.currency);
      const total = num(b.total) ?? 0;
      const available = num(b.available);
      if (!currency || total <= 0) continue;
      if (currency === EUR) {
        cashAvailable = available ?? 0;
        cashTotal = total;
        continue;
      }
      const pair = `${currency}-${EUR}`;
      const price = px.get(pair) ?? null;
      if (price !== null) invested += price * total;
      positions.push({ symbol: px.has(pair) ? pair : null, providerSymbol: pair, name: currency, quantity: total, quantityAvailable: available, averagePrice: null, currentPrice: price, currency: EUR });
    }
    return {
      account: { accountId: "default", label: "Revolut X", environment: s.environment, currency: EUR, cashAvailable, totalValue: cashTotal + invested, investedValue: invested },
      positions,
    };
  }

  const instrument = (p: Pair): BrokerInstrument => ({ symbol: p.symbol, providerSymbol: p.symbol, name: p.base, market: "crypto", currency: EUR, isin: null, quantityStep: Number(p.step) });

  async function order(s: BrokerSession, id: string) {
    try {
      const row = one(await api("GET", `/orders/${encodeURIComponent(id)}`, s));
      return row ? parseOrder(row) : null;
    } catch (e) {
      if (e instanceof Error && "code" in e && (e as { code?: string }).code === "not_found") return null;
      throw e;
    }
  }

  return {
    info: REVOLUTX_INFO,
    async connect(s) {
      return (await snapshot(s)).account;
    },
    async getAccounts(s) {
      return [(await snapshot(s)).account];
    },
    async getPositions(s) {
      return (await snapshot(s)).positions;
    },
    async getOrders(s) {
      return rows(await api("GET", "/orders/active", s)).map(parseOrder);
    },
    async resolveSymbol(_s, ref) {
      if (ref.market !== "crypto") return { status: "unsupported", reason: "Revolut X solo opera criptomonedas." };
      const sym = ref.symbol.trim().toUpperCase();
      const pair = (await pairs()).get(sym.includes("-") ? sym : `${sym}-${EUR}`);
      return pair ? { status: "ok", instrument: instrument(pair), how: "par al contado en euros" } : { status: "not_found" };
    },
    async searchInstruments(_s, query) {
      const q = query.trim().toUpperCase();
      if (q.length < 2) return [];
      return [...(await pairs()).values()].filter((p) => p.symbol.startsWith(q)).slice(0, 20).map(instrument);
    },
    async placeOrder(s, o: AdapterOrder) {
      if (o.type !== "market" && o.type !== "limit") throw revxError("unsupported", "Revolut X solo admite órdenes a mercado y limitadas en CRS.");
      const pair = (await pairs()).get(o.providerSymbol);
      if (!pair) throw revxError("instrument_not_found", "Revolut X no tiene un par activo en euros para ese activo.");
      const base_size = sized(o.quantity, pair);
      const order_configuration =
        o.type === "market"
          ? { market: { base_size } }
          : (() => {
              if (!o.limitPrice || !(o.limitPrice > 0)) throw revxError("invalid_request", "Falta el precio límite.");
              return { limit: { base_size, price: String(o.limitPrice) } };
            })();
      const res = one(await api("POST", "/orders", s, { body: { client_order_id: clientUuid(o.clientOrderId), symbol: pair.symbol, side: o.side, order_configuration } }));
      const id = str(res?.venue_order_id) || str(res?.id);
      if (!id) throw revxError("unknown_outcome", "Revolut X aceptó la petición sin devolver el ID de la orden.");
      return { orderId: id, status: STATUS[str(res?.state) || str(res?.status)] ?? "open", providerStatus: str(res?.state) || str(res?.status) || "accepted" };
    },
    async getOrder(s, id) {
      return order(s, id);
    },
    async cancelOrder(s, id) {
      await api("DELETE", `/orders/${encodeURIComponent(id)}`, s);
    },
  };
}
