// lib/brokers/adapters/trading212/index.ts
// Adaptador de Trading 212. Hoy solo anuncia el entorno demo: el real queda fuera hasta que se
// decida habilitarlo (y además el servidor tiene que permitirlo con BROKERS_REAL_ENABLED).
import type { BrokerAdapter, BrokerSession } from "../../adapter";
import { BrokerError, type ProviderInfo } from "../../types";
import { createApi, defaultDeps, ENABLED_ENVIRONMENTS, PROVIDER_ID, type ApiDeps } from "./api";
import { matchInstrument, orderRequest, orderStatus, parseCatalog, parseHistory, parseOrder, parseOrders, parsePositions, parseSummary, symbolFromTicker, toInstrument, type CatalogItem } from "./mapping";

export const TRADING212_INFO: ProviderInfo = {
  id: PROVIDER_ID,
  name: "Trading 212",
  logo: "https://www.google.com/s2/favicons?domain=trading212.com&sz=64",
  description: "Acciones y ETF sin comisiones. Conexión por clave de API (lectura y órdenes).",
  availability: "available",
  environments: [...ENABLED_ENVIRONMENTS],
  markets: ["bolsa"],
  capabilities: ["accounts", "positions", "orders", "executions", "instruments", "place_order", "order_status", "cancel_order"],
  orderTypes: ["market", "limit", "stop", "stop_limit"],
  credentialFields: [
    { key: "apiKey", label: "Clave de API", secret: true, help: "Trading 212 → Ajustes → API. Crea la clave en la cuenta Demo." },
    { key: "apiSecret", label: "Secreto de API", secret: true },
  ],
  notes: [
    "No permite stop y objetivo enlazados (OCO): CRS deja el stop en el bróker y vigila el objetivo.",
    "Solo se pueden cancelar desde CRS las órdenes creadas por API.",
    "La API limita las consultas (p. ej. el catálogo, una vez cada 50 s): CRS guarda copias cortas.",
    "Por ahora solo cuentas Demo.",
  ],
};

export function createTrading212Adapter(deps: ApiDeps = defaultDeps()): BrokerAdapter {
  const api = createApi(deps);

  // El catálogo es igual para todas las cuentas de un entorno y la API lo limita mucho: caché de 10 min.
  const catalogs = new Map<string, { items: CatalogItem[]; expiresAt: number; pending?: Promise<CatalogItem[]> }>();
  async function catalog(s: BrokerSession): Promise<CatalogItem[]> {
    const hit = catalogs.get(s.environment);
    if (hit && hit.expiresAt > deps.now()) return hit.items;
    if (hit?.pending) return hit.pending;
    const pending = api.call(s, "/equity/metadata/instruments").then(parseCatalog);
    catalogs.set(s.environment, { items: hit?.items ?? [], expiresAt: 0, pending });
    try {
      const items = await pending;
      catalogs.set(s.environment, { items, expiresAt: deps.now() + 10 * 60_000 });
      return items;
    } catch (e) {
      catalogs.delete(s.environment);
      throw e;
    }
  }

  return {
    info: TRADING212_INFO,

    serverCredentials(environment) {
      // Clave personal del .env: solo Demo y solo si el servidor está configurado para Demo.
      if (environment !== "demo" || process.env.TRADING212_ENV !== "demo") return null;
      const apiKey = process.env.TRADING212_API_KEY;
      const apiSecret = process.env.TRADING212_API_SECRET;
      return apiKey && apiSecret ? { apiKey, apiSecret } : null;
    },

    async connect(s) {
      // Comprobar las credenciales es leer el saldo: no se envía nada.
      return parseSummary(await api.call(s, "/equity/account/summary"), s.environment);
    },

    async getAccounts(s) {
      return [parseSummary(await api.read(s, "/equity/account/summary", 6_000, 5_300), s.environment)];
    },

    async getPositions(s) {
      return parsePositions(await api.read(s, "/equity/positions", 2_000, 1_300), symbolFromTicker);
    },

    async getOrders(s) {
      return parseOrders(await api.read(s, "/equity/orders", 3_000, 5_300), symbolFromTicker);
    },

    async getExecutions(s, { limit }) {
      const n = Math.max(1, Math.min(50, Math.floor(limit)));
      return parseHistory(await api.read(s, `/equity/history/orders?limit=${n}`, 10_000, 0), symbolFromTicker).executions;
    },

    async resolveSymbol(s, ref) {
      if (ref.market !== "bolsa") return { status: "unsupported", reason: "Trading 212 no opera criptomonedas en esta integración" };
      return matchInstrument(ref.symbol, await catalog(s), ref.isin ?? null);
    },

    async searchInstruments(s, query) {
      const q = query.trim().toUpperCase();
      if (q.length < 2) return [];
      return (await catalog(s))
        .filter((c) => c.ticker.toUpperCase().startsWith(q) || c.name.toUpperCase().includes(q) || c.isin?.toUpperCase() === q || (c.shortName ?? "").toUpperCase() === q)
        .slice(0, 20)
        .map(toInstrument);
    },

    async placeOrder(s, o) {
      if (!/^[A-Za-z0-9_.-]{1,80}$/.test(o.providerSymbol)) throw new BrokerError("invalid_request", "Ticker no válido", { provider: PROVIDER_ID });
      if (o.quantity > 100_000) throw new BrokerError("invalid_request", "Cantidad fuera de rango", { provider: PROVIDER_ID });
      const { path, body } = orderRequest(o);
      return api.exclusive(s, o.providerSymbol, async () => {
        const r = (await api.call(s, path, { method: "POST", body })) as { id?: unknown; status?: unknown } | null;
        if (!r || !(typeof r.id === "number" || typeof r.id === "string")) {
          throw new BrokerError("unknown_outcome", "Resultado de orden desconocido: revisa la cartera y las órdenes antes de repetir", { provider: PROVIDER_ID });
        }
        return { orderId: String(r.id), status: orderStatus(r.status), providerStatus: typeof r.status === "string" ? r.status : null };
      });
    },

    async getOrder(s, orderId) {
      if (!/^\d{1,20}$/.test(orderId)) throw new BrokerError("invalid_request", "ID de orden no válido", { provider: PROVIDER_ID });
      try {
        return parseOrder(await api.call(s, `/equity/orders/${orderId}`), symbolFromTicker);
      } catch (e) {
        if (!(e instanceof BrokerError) || e.code !== "not_found") throw e;
      }
      // Ya no está pendiente: se busca en el historial reciente.
      const history = parseHistory(await api.read(s, "/equity/history/orders?limit=50", 5_000, 0), symbolFromTicker);
      return history.orders.find((o) => o.orderId === orderId) ?? null;
    },

    async cancelOrder(s, orderId) {
      if (!/^\d{1,20}$/.test(orderId)) throw new BrokerError("invalid_request", "ID de orden no válido", { provider: PROVIDER_ID });
      // Lectura fresca: la orden pudo ejecutarse hace un momento.
      const pending = parseOrders(await api.call(s, "/equity/orders"), symbolFromTicker).find((o) => o.orderId === orderId);
      if (!pending) throw new BrokerError("not_found", "La orden ya no figura entre las pendientes", { provider: PROVIDER_ID });
      if (pending.createdByApi === false) throw new BrokerError("conflict", "Solo se pueden cancelar desde CRS las órdenes creadas por API", { provider: PROVIDER_ID });
      await api.exclusive(s, `cancel:${orderId}`, () => api.call(s, `/equity/orders/${orderId}`, { method: "DELETE" }));
    },
  };
}
