// lib/brokers/adapters/binance/index.ts
// Adaptador de Binance (spot, pares en euros). demo = Spot Testnet; real = cuenta de verdad (además
// el servidor tiene que permitirlo con BROKERS_REAL_ENABLED). Nunca acepta claves con retiros activos.
import type { BrokerAdapter, BrokerSession } from "../../adapter";
import { BrokerError, type ProviderInfo } from "../../types";
import { createApi, defaultDeps, ENABLED_ENVIRONMENTS, PROVIDER_ID, type ApiDeps } from "./api";
import {
  eurPairsOf,
  orderParams,
  orderStatus,
  parseBalances,
  parseExchangeInfo,
  parseOrder,
  parsePrices,
  parseTrades,
  resolve,
  splitOrderKey,
  toAccount,
  toInstrument,
  toPositions,
  valuationRoutes,
  type PairRules,
} from "./mapping";

export const BINANCE_INFO: ProviderInfo = {
  id: PROVIDER_ID,
  name: "Binance",
  logo: "https://www.google.com/s2/favicons?domain=binance.com&sz=64",
  description: "Criptomonedas al contado contra euros. Conexión por clave de API (HMAC).",
  availability: "available",
  environments: [...ENABLED_ENVIRONMENTS],
  markets: ["crypto"],
  capabilities: ["accounts", "positions", "orders", "executions", "instruments", "place_order", "order_status", "cancel_order"],
  orderTypes: ["market", "limit", "stop_limit"],
  credentialFields: [
    { key: "apiKey", label: "API Key", secret: true, help: "Binance → Perfil → Gestión de API. Solo lectura para empezar; NUNCA con retiros." },
    { key: "apiSecret", label: "Secret Key", secret: true },
  ],
  notes: [
    "CRS rechaza las claves que tengan los retiros habilitados.",
    "Restringe la clave a tu IP en Binance siempre que puedas.",
    "Solo pares contra euros (BTC-EUR → BTCEUR). Las cantidades se ajustan al paso mínimo de cada par.",
    "Demo usa el Spot Testnet de Binance (testnet.binance.vision), con claves propias de allí.",
    "Binance no da el precio medio de compra de los saldos: en las posiciones no hay resultado latente.",
  ],
};

export function createBinanceAdapter(deps: ApiDeps = defaultDeps()): BrokerAdapter {
  const api = createApi(deps);

  // Reglas de los pares: iguales para todas las cuentas de un entorno; pesan mucho: caché de 1 h.
  const catalogs = new Map<string, { rules: Map<string, PairRules>; until: number }>();
  async function rules(s: BrokerSession) {
    const hit = catalogs.get(s.environment);
    if (hit && hit.until > deps.now()) return hit.rules;
    const r = parseExchangeInfo(await api.call(s, "GET", "/api/v3/exchangeInfo", { permissions: "SPOT" }, false));
    catalogs.set(s.environment, { rules: r, until: deps.now() + 60 * 60_000 });
    return r;
  }

  async function prices(s: BrokerSession, pairs: string[]) {
    if (!pairs.length) return new Map<string, number>();
    return parsePrices(await api.read(s, "/api/v3/ticker/price", { symbols: JSON.stringify(pairs) }, 5_000, false));
  }

  async function snapshot(s: BrokerSession) {
    const [account, r] = await Promise.all([api.read(s, "/api/v3/account", { omitZeroBalances: true }, 3_000), rules(s)]);
    const { accountId, balances } = parseBalances(account);
    const p = await prices(s, valuationRoutes(balances, r).pairs);
    const positions = toPositions(balances, r, p);
    return { account: toAccount(accountId, s.environment, balances, positions), positions, balances, rules: r };
  }

  const pairOf = async (s: BrokerSession, providerSymbol: string) => {
    const r = (await rules(s)).get(providerSymbol);
    if (!r) throw new BrokerError("instrument_not_found", `Binance no tiene el par ${providerSymbol}`, { provider: PROVIDER_ID });
    return r;
  };

  async function getOrder(s: BrokerSession, orderId: string) {
    const k = splitOrderKey(orderId);
    if (!k) throw new BrokerError("invalid_request", "ID de orden no válido", { provider: PROVIDER_ID });
    try {
      return parseOrder(await api.call(s, "GET", "/api/v3/order", { symbol: k.pair, orderId: k.id }), await rules(s));
    } catch (e) {
      if (e instanceof BrokerError && e.code === "not_found") return null;
      throw e;
    }
  }

  return {
    info: BINANCE_INFO,

    async connect(s) {
      if (s.environment === "real") {
        // Seguridad: una clave capaz de retirar fondos no se acepta nunca. Si no se puede comprobar, tampoco.
        type Restrictions = { enableWithdrawals?: unknown; enableInternalTransfer?: unknown };
        let restrictions: Restrictions | null = null;
        try {
          restrictions = (await api.call(s, "GET", "/sapi/v1/account/apiRestrictions")) as Restrictions;
        } catch (e) {
          if (e instanceof BrokerError && e.code === "auth_failed") throw e;
          throw new BrokerError("forbidden", "No se pudieron comprobar los permisos de la clave en Binance; por seguridad no se conecta", { provider: PROVIDER_ID });
        }
        if (restrictions?.enableWithdrawals !== false) {
          throw new BrokerError("forbidden", "Esta clave de Binance tiene los retiros habilitados: desactívalos (o crea otra clave sin retiros) y vuelve a conectar", { provider: PROVIDER_ID });
        }
      }
      return (await snapshot(s)).account;
    },

    async getAccounts(s) {
      return [(await snapshot(s)).account];
    },

    async getPositions(s) {
      return (await snapshot(s)).positions;
    },

    async getOrders(s) {
      const [list, r] = await Promise.all([api.read(s, "/api/v3/openOrders", {}, 3_000), rules(s)]);
      if (!Array.isArray(list)) throw new BrokerError("provider_unavailable", "Binance devolvió órdenes no válidas", { provider: PROVIDER_ID });
      return list.map((o) => parseOrder(o, r));
    },

    async getExecutions(s, { limit }) {
      // Binance pide el par: se consultan los pares en euros con saldo (hasta 8).
      const snap = await snapshot(s);
      const pairs = eurPairsOf(snap.balances, snap.rules).slice(0, 8);
      const n = Math.max(1, Math.min(50, Math.floor(limit)));
      const all = (await Promise.all(pairs.map(async (pair) => parseTrades(pair, await api.read(s, "/api/v3/myTrades", { symbol: pair, limit: n }, 10_000), snap.rules)))).flat();
      return all.sort((a, b) => (b.executedAt ?? "").localeCompare(a.executedAt ?? "")).slice(0, n);
    },

    async resolveSymbol(s, ref) {
      if (ref.market !== "crypto") return { status: "unsupported", reason: "Binance no opera acciones en esta integración" };
      return resolve(ref.symbol, await rules(s));
    },

    async searchInstruments(s, query) {
      const q = query.trim().toUpperCase().replace(/-EUR$/, "");
      if (q.length < 2) return [];
      return [...(await rules(s)).values()]
        .filter((r) => r.quote === "EUR" && r.trading && (r.base.startsWith(q) || r.pair.startsWith(q)))
        .slice(0, 20)
        .map(toInstrument);
    },

    async placeOrder(s, o) {
      const r = await pairOf(s, o.providerSymbol);
      // Para comprobar el importe mínimo de una orden a mercado hace falta un precio de referencia.
      const ref = o.type === "market" ? (await prices(s, [r.pair])).get(r.pair) ?? null : null;
      const params = orderParams(o, r, ref);
      return api.exclusive(s, r.pair, async () => {
        const res = (await api.call(s, "POST", "/api/v3/order", params)) as Record<string, unknown>;
        if (!res || !(typeof res.orderId === "number" || typeof res.orderId === "string")) {
          throw new BrokerError("unknown_outcome", "Resultado de orden desconocido: revisa la cuenta antes de repetir", { provider: PROVIDER_ID });
        }
        return { orderId: `${r.pair}:${res.orderId}`, status: orderStatus(res.status), providerStatus: typeof res.status === "string" ? res.status : null };
      });
    },

    getOrder,

    async findOrderByClientId(s, { providerSymbol, clientOrderId }) {
      try {
        return parseOrder(await api.call(s, "GET", "/api/v3/order", { symbol: providerSymbol, origClientOrderId: clientOrderId }), await rules(s));
      } catch (e) {
        if (e instanceof BrokerError && e.code === "not_found") return null;
        throw e;
      }
    },

    async cancelOrder(s, orderId) {
      const k = splitOrderKey(orderId);
      if (!k) throw new BrokerError("invalid_request", "ID de orden no válido", { provider: PROVIDER_ID });
      const current = await getOrder(s, orderId);
      if (!current) throw new BrokerError("not_found", "Binance no encuentra esa orden", { provider: PROVIDER_ID });
      if (current.createdByApi === false) throw new BrokerError("conflict", "Solo se cancelan desde CRS las órdenes creadas por CRS", { provider: PROVIDER_ID });
      await api.exclusive(s, k.pair, () => api.call(s, "DELETE", "/api/v3/order", { symbol: k.pair, orderId: k.id }));
    },
  };
}
