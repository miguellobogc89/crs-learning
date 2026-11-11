// lib/brokers/adapters/bitvavo/index.ts
// Adaptador de Bitvavo (cripto al contado contra euros, con licencia MiCA y registro en España).
// Solo cuenta real (Bitvavo no tiene entorno de pruebas público): el servidor tiene que permitirlo con
// BROKERS_REAL_ENABLED. No llama nunca a endpoints de retiros. Bitvavo no informa de los permisos de una
// clave: quien conecta debe crearla SIN el permiso de retirar.
import { BrokerError, type ProviderInfo } from "../../types";
import type { BrokerAdapter, BrokerSession } from "../../adapter";
import { createApi, defaultDeps, ENABLED_ENVIRONMENTS, OPERATOR_ID, PROVIDER_ID, type ApiDeps } from "./api";
import {
  clientUuid,
  orderBody,
  parseBalances,
  parseMarkets,
  parseOrder,
  parsePrices,
  parseTrades,
  QUOTE,
  resolve,
  splitOrderKey,
  toAccount,
  toInstrument,
  toPositions,
  type MarketRules,
} from "./mapping";

export const BITVAVO_INFO: ProviderInfo = {
  id: PROVIDER_ID,
  name: "Bitvavo",
  logo: "https://www.google.com/s2/favicons?domain=bitvavo.com&sz=64",
  description: "Criptomonedas al contado contra euros (licencia MiCA, registrado en España). Conexión por clave de API.",
  availability: "available",
  environments: [...ENABLED_ENVIRONMENTS],
  markets: ["crypto"],
  capabilities: ["accounts", "positions", "orders", "executions", "instruments", "place_order", "order_status", "cancel_order"],
  orderTypes: ["market", "limit", "stop", "stop_limit"],
  credentialFields: [
    { key: "apiKey", label: "API Key", secret: true, help: "Bitvavo → Ajustes → API. Permisos: «Ver información» y «Operar». NUNCA «Retirar»." },
    { key: "apiSecret", label: "API Secret", secret: true },
  ],
  notes: [
    "Bitvavo no deja comprobar los permisos de una clave: créala SIN el permiso de retirar.",
    "CRS nunca llama a los endpoints de retiros de Bitvavo.",
    "Solo pares contra euros (BTC-EUR, el mismo formato que CRS). Las cantidades se ajustan a los decimales de cada par.",
    "Bitvavo no tiene entorno de pruebas: la conexión es siempre real. Para probar, usa el modo ensayo de la copia.",
    "Bitvavo no da el precio medio de compra de los saldos: en las posiciones no hay resultado latente.",
  ],
};

export function createBitvavoAdapter(deps: ApiDeps = defaultDeps()): BrokerAdapter {
  const api = createApi(deps);

  let catalog: { markets: Map<string, MarketRules>; until: number } | null = null;
  async function markets() {
    if (catalog && catalog.until > deps.now()) return catalog.markets;
    const m = parseMarkets(await api.call(null, "GET", "/markets"));
    catalog = { markets: m, until: deps.now() + 60 * 60_000 };
    return m;
  }
  const prices = async () => parsePrices(await api.read(null, "/ticker/price", {}, 5_000));

  async function snapshot(s: BrokerSession) {
    const [raw, m, p] = await Promise.all([api.read(s, "/balance", {}, 3_000), markets(), prices()]);
    const balances = parseBalances(raw);
    const positions = toPositions(balances, m, p);
    return { account: toAccount(s.environment, balances, positions), positions, balances, markets: m };
  }

  const marketOf = async (providerSymbol: string) => {
    const r = (await markets()).get(providerSymbol);
    if (!r) throw new BrokerError("instrument_not_found", `Bitvavo no tiene el par ${providerSymbol}`, { provider: PROVIDER_ID });
    return r;
  };

  async function getOrder(s: BrokerSession, orderId: string) {
    const k = splitOrderKey(orderId);
    if (!k) throw new BrokerError("invalid_request", "ID de orden no válido", { provider: PROVIDER_ID });
    try {
      return parseOrder(await api.call(s, "GET", "/order", { market: k.market, orderId: k.id }));
    } catch (e) {
      if (e instanceof BrokerError && e.code === "not_found") return null;
      throw e;
    }
  }

  return {
    info: BITVAVO_INFO,

    async connect(s) {
      // Lectura de saldos: comprueba clave, secreto, firma y permiso de lectura. No envía órdenes.
      return (await snapshot(s)).account;
    },

    async getAccounts(s) {
      return [(await snapshot(s)).account];
    },

    async getPositions(s) {
      return (await snapshot(s)).positions;
    },

    async getOrders(s) {
      const list = await api.read(s, "/ordersOpen", {}, 3_000);
      if (!Array.isArray(list)) throw new BrokerError("provider_unavailable", "Bitvavo devolvió órdenes no válidas", { provider: PROVIDER_ID });
      return list.map(parseOrder);
    },

    async getExecutions(s, { limit }) {
      // Bitvavo pide el mercado: se consultan los pares en euros con saldo (hasta 8).
      const snap = await snapshot(s);
      const list = snap.balances.map((b) => `${b.asset}-${QUOTE}`).filter((m) => snap.markets.has(m)).slice(0, 8);
      const count = Math.max(1, Math.min(50, Math.floor(limit)));
      const all = (await Promise.all(list.map(async (market) => parseTrades(await api.read(s, "/trades", { market, limit: count }, 10_000))))).flat();
      return all.sort((a, b) => (b.executedAt ?? "").localeCompare(a.executedAt ?? "")).slice(0, count);
    },

    async resolveSymbol(_s, ref) {
      if (ref.market !== "crypto") return { status: "unsupported", reason: "Bitvavo solo opera criptomonedas" };
      return resolve(ref.symbol, await markets());
    },

    async searchInstruments(_s, query) {
      const q = query.trim().toUpperCase().replace(/-EUR$/, "");
      if (q.length < 2) return [];
      return [...(await markets()).values()]
        .filter((r) => r.quote === QUOTE && r.trading && r.base.startsWith(q))
        .slice(0, 20)
        .map(toInstrument);
    },

    async placeOrder(s, o) {
      const r = await marketOf(o.providerSymbol);
      const ref = o.type === "market" ? (await prices()).get(r.market) ?? null : null;
      const body = orderBody(o, r, ref);
      return api.exclusive(s, r.market, async () => {
        const res = (await api.call(s, "POST", "/order", {}, body)) as Record<string, unknown>;
        if (!res || typeof res.orderId !== "string") {
          throw new BrokerError("unknown_outcome", "Resultado de orden desconocido: revisa la cuenta antes de repetir", { provider: PROVIDER_ID });
        }
        const parsed = parseOrder({ market: r.market, ...res });
        return { orderId: parsed.orderId, status: parsed.status, providerStatus: parsed.providerStatus };
      });
    },

    getOrder,

    async findOrderByClientId(s, { providerSymbol, clientOrderId }) {
      try {
        return parseOrder(await api.call(s, "GET", "/order", { market: providerSymbol, clientOrderId: clientUuid(clientOrderId) }));
      } catch (e) {
        if (e instanceof BrokerError && e.code === "not_found") return null;
        throw e;
      }
    },

    async cancelOrder(s, orderId) {
      const k = splitOrderKey(orderId);
      if (!k) throw new BrokerError("invalid_request", "ID de orden no válido", { provider: PROVIDER_ID });
      await api.exclusive(s, k.market, () => api.call(s, "DELETE", "/order", { market: k.market, orderId: k.id, operatorId: OPERATOR_ID }));
    },
  };
}
