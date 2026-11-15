import { createHash } from "node:crypto";
import type { AdapterOrder, BrokerAdapter, BrokerSession } from "../../adapter";
import type { BrokerAccount, BrokerExecution, BrokerInstrument, BrokerOrder, BrokerPosition, OrderStatus, ProviderInfo } from "../../types";
import { createApi, ID, okxError, type ApiDeps } from "./api";

const EUR = "EUR";
const SPOT = { instType: "SPOT" };
const PAIR = /^[A-Z0-9]+-EUR$/;
const ORDER_KEY = /^([A-Z0-9]+-EUR):(\d+)$/;

export const OKX_INFO: ProviderInfo = {
  id: ID,
  name: "OKX Europe",
  logo: "https://www.google.com/s2/favicons?domain=okx.com&sz=64",
  description: "Criptomonedas al contado contra euros. Conecta tu cuenta europea de OKX.",
  availability: "available",
  environments: ["real", "demo"],
  markets: ["crypto"],
  capabilities: ["accounts", "positions", "orders", "executions", "instruments", "place_order", "order_status", "cancel_order"],
  orderTypes: ["market", "limit"],
  credentialFields: [
    { key: "apiKey", label: "API Key", secret: true, help: "Crea una clave API en OKX Europe con permiso de lectura. Activa Trading si quieres enviar órdenes." },
    { key: "apiSecret", label: "Secret Key", secret: true },
    { key: "passphrase", label: "Frase de contraseña de la API", secret: true, help: "La frase que elegiste al crear esta clave de API." },
  ],
  notes: [
    "Usa una clave sin permiso de retirada. CRS rechaza claves con ese permiso.",
    "Se muestran los saldos de la cuenta de Trading. Para operar necesitas euros disponibles ahí.",
    "Solo compraventa al contado en pares contra EUR, con órdenes a mercado o limitadas.",
    "Para Demo, crea una clave propia en el modo de simulación de OKX.",
  ],
};

type Row = Record<string, unknown>;
type Pair = { id: string; base: string; lot: string; tick: string; minimum: number };
type Snapshot = { account: BrokerAccount; positions: BrokerPosition[] };

const str = (x: unknown) => typeof x === "string" ? x : "";
const num = (x: unknown) => {
  const raw = str(x);
  const n = Number(raw);
  return raw.trim() && Number.isFinite(n) ? n : null;
};
const positive = (x: unknown) => (num(x) ?? 0) > 0;
const time = (x: unknown) => {
  const n = num(x);
  return n !== null && n > 0 && n <= 8.64e15 ? new Date(n).toISOString() : null;
};
// El identificador de CRS admite 35 caracteres, OKX admite 32.
const clientId = (id: string) => `crs${createHash("sha256").update(id).digest("hex").slice(0, 29)}`;
const key = (pair: string, id: string) => `${pair}:${id}`;
const readKey = (id: string) => {
  const match = ORDER_KEY.exec(id);
  if (!match) throw okxError("invalid_request", "Identificador de orden de OKX no válido.");
  return { instId: match[1], ordId: match[2] };
};

const instrument = (pair: Pair): BrokerInstrument => ({
  symbol: pair.id, providerSymbol: pair.id, name: pair.base, market: "crypto", currency: EUR, isin: null, quantityStep: Number(pair.lot),
});

const statuses: Record<string, OrderStatus> = { live: "open", partially_filled: "partially_filled", filled: "filled", canceled: "cancelled", mmp_canceled: "cancelled" };
const cashOrder = (row: Row) => row.tdMode === "cash" && PAIR.test(str(row.instId));

function parseOrder(row: Row): BrokerOrder {
  const { instId, ordId } = readKey(key(str(row.instId), str(row.ordId)));
  const side = row.side;
  const size = num(row.sz);
  if ((side !== "buy" && side !== "sell") || size === null) throw okxError("provider_unavailable", "OKX devolvió una orden no válida.");
  return {
    orderId: key(instId, ordId), symbol: instId, providerSymbol: instId, side,
    type: row.ordType === "market" ? "market" : "limit",
    status: statuses[str(row.state)] ?? "unknown",
    providerStatus: str(row.state) || null,
    quantity: row.ordType === "market" && row.tgtCcy === "quote_ccy" ? num(row.accFillSz) ?? 0 : size,
    filledQuantity: num(row.accFillSz), limitPrice: num(row.px), stopPrice: null,
    averageFillPrice: num(row.avgPx), createdByApi: /^crs[a-f0-9]{29}$/.test(str(row.clOrdId)),
    createdAt: time(row.cTime),
  };
}

function orderSize(order: AdapterOrder, pair: Pair) {
  const step = Number(pair.lot);
  const units = order.quantity / step;
  const snapped = Math.round(units);
  const steps = Math.abs(units - snapped) <= 1e-9 ? snapped : Math.floor(units);
  const decimals = pair.lot.split(".")[1]?.length ?? 0;
  if (!Number.isSafeInteger(steps) || steps <= 0 || decimals > 18) throw okxError("invalid_request", "Cantidad fuera del rango de OKX.");
  const size = (steps * step).toFixed(decimals);
  if (Number(size) < pair.minimum) throw okxError("invalid_request", `La cantidad mínima de ${pair.id} es ${pair.minimum}.`);
  return size;
}

function limitPrice(order: AdapterOrder, pair: Pair) {
  const price = order.limitPrice;
  const tick = Number(pair.tick);
  const decimals = pair.tick.split(".")[1]?.length ?? 0;
  if (!price || !Number.isFinite(price) || price <= 0 || decimals > 18 || Math.abs(price / tick - Math.round(price / tick)) > 1e-8) {
    throw okxError("invalid_request", `El precio límite debe ajustarse al paso de ${pair.tick} € de ${pair.id}.`);
  }
  return price.toFixed(decimals);
}

export function createOkxAdapter(deps: ApiDeps = {
  fetch: (input, init) => fetch(input, init),
  now: Date.now,
  brokerCode: process.env.OKX_BROKER_CODE,
}): BrokerAdapter {
  const api = createApi(deps);
  const catalogs = new Map<BrokerSession["environment"], { until: number; pairs: Map<string, Pair> }>();

  async function pairs(s: BrokerSession) {
    const cached = catalogs.get(s.environment);
    if (cached && cached.until > deps.now()) return cached.pairs;
    const result = new Map<string, Pair>();
    for (const row of await api("instruments", s, { query: SPOT })) {
      const id = str(row.instId);
      const base = str(row.baseCcy);
      if (row.state !== "live" || row.quoteCcy !== EUR || !PAIR.test(id) || id !== `${base}-EUR`) continue;
      if (![row.lotSz, row.tickSz, row.minSz].every(positive)) continue;
      result.set(id, { id, base, lot: str(row.lotSz), tick: str(row.tickSz), minimum: Number(row.minSz) });
    }
    catalogs.set(s.environment, { until: deps.now() + 60 * 60_000, pairs: result });
    return result;
  }

  async function config(s: BrokerSession) {
    const [row] = await api("config", s);
    const perms = str(row?.perm).split(",").map((item) => item.trim());
    if (!perms.includes("read_only") || !str(row?.uid)) throw okxError("permission_denied", "OKX no confirmó una clave con permiso de lectura.");
    if (perms.includes("withdraw")) throw okxError("forbidden", "Crea una clave de OKX sin permiso de retirada.");
    return row;
  }

  async function snapshot(s: BrokerSession, identity?: Row): Promise<Snapshot> {
    const [configuration, [balance], tickerRows] = await Promise.all([
      identity ? Promise.resolve(identity) : config(s),
      api("balance", s),
      api("tickers", s, { query: SPOT }),
    ]);
    if (!Array.isArray(balance?.details)) throw okxError("provider_unavailable", "OKX no devolvió el saldo de Trading.");
    const tickers = new Map(tickerRows.filter((row) => positive(row.last)).map((row) => [str(row.instId), Number(row.last)]));
    const usdcEur = tickers.get("USDC-EUR");
    const positions: BrokerPosition[] = [];
    let cashAvailable = 0;
    let cashTotal = 0;
    let investedValue = 0;
    for (const row of balance.details as Row[]) {
      const currency = str(row.ccy);
      const quantity = num(row.cashBal) ?? 0;
      const available = num(row.availBal);
      if (!currency || quantity <= 0) continue;
      if (currency === EUR) {
        cashAvailable = available ?? 0;
        cashTotal = quantity;
        continue;
      }
      const pair = `${currency}-EUR`;
      const eurPrice = tickers.get(pair);
      const usdcPrice = tickers.get(`${currency}-USDC`);
      const price = eurPrice ?? (usdcEur && usdcPrice ? usdcEur * usdcPrice : null);
      if (price !== null) investedValue += price * quantity;
      positions.push({
        symbol: eurPrice ? pair : null, providerSymbol: eurPrice ? pair : currency, name: currency,
        quantity, quantityAvailable: available, averagePrice: null, currentPrice: price, currency: EUR,
      });
    }
    return {
      account: { accountId: str(configuration.uid), label: "OKX Europe · Trading", environment: s.environment, currency: EUR, cashAvailable, totalValue: cashTotal + investedValue, investedValue },
      positions,
    };
  }

  async function lookup(s: BrokerSession, query: Record<string, string>) {
    try {
      const [row] = await api("order", s, { query });
      return row && cashOrder(row) ? parseOrder(row) : null;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "not_found") return null;
      throw error;
    }
  }

  return {
    info: OKX_INFO,
    async connect(s) {
      return (await snapshot(s, await config(s))).account;
    },
    async getAccounts(s) {
      return [(await snapshot(s)).account];
    },
    async getPositions(s) {
      return (await snapshot(s)).positions;
    },
    async getOrders(s) {
      return (await api("pending", s, { query: SPOT })).filter(cashOrder).map(parseOrder);
    },
    async getExecutions(s, { limit }) {
      const count = Math.min(100, Math.max(1, Math.floor(limit) || 1));
      const rows = await api("fills", s, { query: { ...SPOT, limit: String(count) } });
      return rows.flatMap((row): BrokerExecution[] => {
        const pair = str(row.instId);
        const id = str(row.ordId);
        const executionId = str(row.billId) || (str(row.tradeId) ? key(pair, str(row.tradeId)) : "");
        const price = num(row.fillPx);
        const quantity = num(row.fillSz);
        if (!PAIR.test(pair) || !executionId || !price || !quantity || (row.side !== "buy" && row.side !== "sell")) return [];
        return [{ executionId, orderId: id ? key(pair, id) : null, symbol: pair, providerSymbol: pair, side: row.side, quantity, price, currency: EUR, executedAt: time(row.ts) }];
      });
    },
    async resolveSymbol(s, ref) {
      if (ref.market !== "crypto") return { status: "unsupported", reason: "OKX solo opera criptomonedas en CRS." };
      const symbol = ref.symbol.trim().toUpperCase();
      const pair = (await pairs(s)).get(symbol.includes("-") ? symbol : `${symbol}-EUR`);
      return pair ? { status: "ok", instrument: instrument(pair), how: "par spot en euros" } : { status: "not_found" };
    },
    async searchInstruments(s, query) {
      const q = query.trim().toUpperCase();
      if (q.length < 2) return [];
      return [...(await pairs(s)).values()].filter((pair) => pair.id.startsWith(q)).slice(0, 20).map(instrument);
    },
    async placeOrder(s, order) {
      if (order.type !== "market" && order.type !== "limit") throw okxError("unsupported", "OKX solo admite órdenes a mercado y limitadas en CRS.");
      if (order.type === "limit" && order.timeInForce !== "gtc") throw okxError("unsupported", "Las órdenes limitadas de OKX permanecen abiertas hasta su ejecución o cancelación.");
      const pair = (await pairs(s)).get(order.providerSymbol);
      if (!pair) throw okxError("instrument_not_found", "OKX no tiene un par activo en euros para ese activo.");
      const tag = s.environment === "real" ? deps.brokerCode?.trim() : undefined;
      if (tag && !/^[A-Za-z0-9]{1,16}$/.test(tag)) throw okxError("misconfigured", "El código de socio de OKX no tiene un formato válido.");
      const [row] = await api("place", s, { body: {
        instId: pair.id, tdMode: "cash", side: order.side, ordType: order.type, sz: orderSize(order, pair),
        clOrdId: clientId(order.clientOrderId),
        ...(order.type === "market" ? { tgtCcy: "base_ccy", banAmend: true } : { px: limitPrice(order, pair) }),
        ...(tag ? { tag } : {}),
      } });
      const id = str(row?.ordId);
      if (!/^\d+$/.test(id)) throw okxError("unknown_outcome", "OKX aceptó la petición sin devolver un ID de orden.");
      return { orderId: key(pair.id, id), status: "open", providerStatus: "accepted" };
    },
    async getOrder(s, id) {
      return lookup(s, readKey(id));
    },
    async findOrderByClientId(s, order) {
      if (!PAIR.test(order.providerSymbol)) return null;
      return lookup(s, { instId: order.providerSymbol, clOrdId: clientId(order.clientOrderId) });
    },
    async cancelOrder(s, id) {
      const parsed = readKey(id);
      if (!(await lookup(s, parsed))) throw okxError("not_found", "No se encontró una orden al contado en euros con ese ID.");
      await api("cancel", s, { body: parsed });
    },
  };
}
