// lib/brokers/adapters/coinbase/index.ts
// Adaptador de Coinbase Advanced Trade (cripto al contado contra euros y USDC; licencia MiCA desde
// Luxemburgo). Solo cuenta real: el servidor tiene que permitirlo con BROKERS_REAL_ENABLED. Nunca acepta
// claves con permiso de transferir y nunca llama a endpoints de envíos o retiros.
import { BrokerError, type ProviderInfo } from "../../types";
import type { BrokerAdapter, BrokerSession } from "../../adapter";
import { createApi, defaultDeps, ENABLED_ENVIRONMENTS, PROVIDER_ID, type ApiDeps } from "./api";
import {
  cashCurrencyOf,
  cashOf,
  conversionPlan,
  EUR,
  orderBody,
  parseAccounts,
  parseFills,
  parseOrder,
  parseOrders,
  parseProducts,
  resolve,
  toAccount,
  toInstrument,
  toPositions,
  USDC,
  type Balance,
  type Product,
} from "./mapping";

export const COINBASE_INFO: ProviderInfo = {
  id: PROVIDER_ID,
  name: "Coinbase",
  logo: "https://www.google.com/s2/favicons?domain=coinbase.com&sz=64",
  description: "Criptomonedas al contado contra euros y USDC (Advanced Trade, licencia MiCA). Conexión por clave de API.",
  availability: "available",
  environments: [...ENABLED_ENVIRONMENTS],
  markets: ["crypto"],
  capabilities: ["accounts", "positions", "orders", "executions", "instruments", "place_order", "order_status", "cancel_order"],
  orderTypes: ["market", "limit", "stop_limit"],
  cashCurrencies: ["EUR", "USDC"],
  credentialFields: [
    {
      key: "apiKey",
      label: "Nombre de la clave (API key name)",
      secret: true,
      help: "Coinbase → Ajustes → API (portal de desarrolladores, «Secret API Keys») → Crear clave. Algoritmo ECDSA. Permisos «View» y «Trade»; NUNCA «Transfer». Es el texto «organizations/…/apiKeys/…».",
    },
    { key: "apiSecret", label: "Clave privada", secret: true, help: "El bloque «-----BEGIN EC PRIVATE KEY----- … -----END EC PRIVATE KEY-----» completo (o pega aquí el JSON que descargaste)." },
  ],
  notes: [
    "CRS rechaza las claves que tengan el permiso de transferir y nunca llama a envíos ni retiros.",
    "Crea la clave con el algoritmo ECDSA (con Ed25519 Coinbase puede rechazar la conexión).",
    "Muchas monedas de Coinbase solo cotizan en USDC: cambia tus euros a USDC desde «Ver cuenta» para poder copiarlas. Todo se enseña en euros.",
    "Coinbase no tiene entorno de pruebas: la conexión es siempre real.",
    "Coinbase no da el precio medio de compra de los saldos: en las posiciones no hay resultado latente.",
  ],
};

const PRODUCTS = "/api/v3/brokerage/market/products";
const ACCOUNTS = "/api/v3/brokerage/accounts";
const ORDERS = "/api/v3/brokerage/orders";
const HISTORICAL = "/api/v3/brokerage/orders/historical";

export function createCoinbaseAdapter(deps: ApiDeps = defaultDeps()): BrokerAdapter {
  const api = createApi(deps);

  // Catálogo con precios (público): las reglas casi no cambian, pero el precio sí. Caché de 20 s.
  let catalog: { products: Map<string, Product>; until: number } | null = null;
  async function products(fresh = false) {
    if (!fresh && catalog && catalog.until > deps.now()) return catalog.products;
    const p = parseProducts(await api.call(null, "GET", PRODUCTS, { product_type: "SPOT" }));
    catalog = { products: p, until: deps.now() + 20_000 };
    return p;
  }

  async function balances(s: BrokerSession): Promise<Balance[]> {
    const all: Balance[] = [];
    let cursor: string | undefined;
    // Coinbase pagina las cuentas (una por moneda): hasta 4 páginas de 250.
    for (let page = 0; page < 4; page++) {
      const r = parseAccounts(await api.read(s, ACCOUNTS, { limit: 250, cursor }, 3_000));
      all.push(...r.balances);
      if (!r.hasNext || !r.cursor) break;
      cursor = r.cursor;
    }
    return all;
  }

  async function snapshot(s: BrokerSession) {
    const [b, p] = await Promise.all([balances(s), products()]);
    const prefer = cashCurrencyOf(cashOf(b, p));
    const positions = toPositions(b, p, prefer);
    return { account: toAccount(s.environment, b, p, positions), positions, balances: b, products: p, prefer };
  }

  const productOf = async (id: string) => {
    const p = (await products()).get(id);
    if (!p) throw new BrokerError("instrument_not_found", `Coinbase no tiene el par ${id}`, { provider: PROVIDER_ID });
    return p;
  };

  async function getOrder(s: BrokerSession, orderId: string) {
    if (!/^[A-Za-z0-9-]{1,64}$/.test(orderId)) throw new BrokerError("invalid_request", "ID de orden no válido", { provider: PROVIDER_ID });
    try {
      return parseOrder(await api.call(s, "GET", `${HISTORICAL}/${orderId}`), await products());
    } catch (e) {
      if (e instanceof BrokerError && e.code === "not_found") return null;
      throw e;
    }
  }

  return {
    info: COINBASE_INFO,

    async connect(s) {
      // Seguridad: una clave capaz de transferir fondos no se acepta nunca. Si no se puede comprobar, tampoco.
      type Perms = { can_view?: unknown; can_trade?: unknown; can_transfer?: unknown };
      let perms: Perms;
      try {
        perms = (await api.call(s, "GET", "/api/v3/brokerage/key_permissions")) as Perms;
      } catch (e) {
        if (e instanceof BrokerError && e.code === "auth_failed") throw e;
        const cause = e instanceof Error ? e.message.replace(/^Coinbase:\s*/, "").slice(0, 200) : "error desconocido";
        throw new BrokerError("forbidden", `No se pudieron comprobar los permisos de la clave en Coinbase (${cause}); por seguridad no se conecta`, { provider: PROVIDER_ID });
      }
      if (perms?.can_transfer !== false) {
        throw new BrokerError("forbidden", "Esta clave de Coinbase tiene el permiso de transferir: crea otra solo con «View» y «Trade» y vuelve a conectar", { provider: PROVIDER_ID });
      }
      if (perms?.can_view !== true) throw new BrokerError("auth_failed", "La clave de Coinbase no tiene el permiso «View»", { provider: PROVIDER_ID });
      return (await snapshot(s)).account;
    },

    async getAccounts(s) {
      return [(await snapshot(s)).account];
    },

    async getPositions(s) {
      return (await snapshot(s)).positions;
    },

    async getOrders(s) {
      const [data, p] = await Promise.all([api.read(s, `${HISTORICAL}/batch`, { order_status: "OPEN", limit: 100 }, 3_000), products()]);
      return parseOrders(data, p);
    },

    async getExecutions(s, { limit }) {
      const count = Math.max(1, Math.min(50, Math.floor(limit)));
      return parseFills(await api.read(s, `${HISTORICAL}/fills`, { limit: count }, 10_000));
    },

    async resolveSymbol(s, ref) {
      if (ref.market !== "crypto") return { status: "unsupported", reason: "Coinbase solo opera criptomonedas" };
      // Con qué efectivo se compra (euros o USDC); si no se puede leer la cuenta, en euros.
      const prefer = await snapshot(s).then((x) => x.prefer).catch(() => "EUR" as const);
      return resolve(ref.symbol, await products(), prefer);
    },

    async searchInstruments(_s, query) {
      const q = query.trim().toUpperCase().replace(/-EUR$/, "");
      if (q.length < 2) return [];
      return [...(await products()).values()]
        .filter((p) => (p.quote === EUR || p.quote === USDC) && p.trading && p.base.startsWith(q))
        .slice(0, 20)
        .map(toInstrument);
    },

    async placeOrder(s, o) {
      const p = await productOf(o.providerSymbol);
      const body = orderBody(o, p);
      return api.exclusive(s, p.product, async () => {
        const res = (await api.call(s, "POST", ORDERS, {}, body)) as {
          success?: unknown;
          success_response?: { order_id?: unknown };
          error_response?: { error?: unknown; message?: unknown; error_details?: unknown; preview_failure_reason?: unknown; new_order_failure_reason?: unknown };
        };
        if (res?.success === false) {
          const e = res.error_response ?? {};
          const parts = [e.message, e.error_details, e.new_order_failure_reason, e.preview_failure_reason, e.error].filter((x): x is string => typeof x === "string" && !!x && x !== "UNKNOWN_FAILURE_REASON");
          const text = parts[0]?.slice(0, 200) ?? "orden rechazada";
          const broke = parts.some((x) => /INSUFFICIENT_FUND|insufficient (fund|balance)/i.test(x));
          throw new BrokerError(broke ? "insufficient_funds" : "invalid_request", broke ? "Coinbase: saldo insuficiente" : `Coinbase: ${text}`, { provider: PROVIDER_ID });
        }
        const id = res?.success_response?.order_id;
        if (typeof id !== "string") {
          throw new BrokerError("unknown_outcome", "Resultado de orden desconocido: revisa la cuenta antes de repetir", { provider: PROVIDER_ID });
        }
        // Coinbase solo confirma que la aceptó; el estado real se consulta después.
        return { orderId: id, status: "open", providerStatus: "PENDING" };
      });
    },

    getOrder,

    async findOrderByClientId(s, { providerSymbol, clientOrderId }) {
      // Coinbase no filtra por nuestro identificador: se busca entre las últimas órdenes de ese par.
      const [data, p] = await Promise.all([api.call(s, "GET", `${HISTORICAL}/batch`, { product_ids: [providerSymbol], limit: 100 }), products()]);
      const raw = (data as { orders?: unknown[] })?.orders ?? [];
      const hit = raw.find((o) => (o as { client_order_id?: unknown })?.client_order_id === clientOrderId);
      return hit ? parseOrder(hit, p) : null;
    },

    async cancelOrder(s, orderId) {
      const current = await getOrder(s, orderId);
      if (!current) throw new BrokerError("not_found", "Coinbase no encuentra esa orden", { provider: PROVIDER_ID });
      if (current.createdByApi === false) throw new BrokerError("conflict", "Solo se cancelan desde CRS las órdenes creadas por CRS", { provider: PROVIDER_ID });
      const res = (await api.exclusive(s, current.providerSymbol, () => api.call(s, "POST", `${ORDERS}/batch_cancel`, {}, { order_ids: [orderId] }))) as { results?: { success?: unknown; failure_reason?: unknown }[] };
      const r = res?.results?.[0];
      if (r && r.success === false) throw new BrokerError("conflict", `Coinbase no pudo cancelarla (${String(r.failure_reason ?? "motivo desconocido")})`, { provider: PROVIDER_ID });
    },

    async planCashConversion(_s, to, amount) {
      // Siempre con el precio del momento (no el de la caché).
      return conversionPlan(to, amount, await products(true));
    },
  };
}
