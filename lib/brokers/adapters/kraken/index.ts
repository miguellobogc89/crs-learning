import type { BrokerAdapter, BrokerSession } from "../../adapter";
import { BrokerError, type ProviderInfo } from "../../types";
import { createKrakenApi, defaultKrakenDeps, type KrakenApiDeps } from "./api";
import {
  baseOf, isKrakenPerpetual, krakenSymbol, mapAccount, mapContracts, mapFills,
  mapFundingRates, mapOrders, mapPositions, mapTicker, toBrokerExecution,
  toBrokerPosition, toInstrument,
  type KrakenContract, type KrakenFill, type KrakenFundingRate, type KrakenFuturesAccount,
  type KrakenOpenPosition, type KrakenOrderInput, type KrakenTicker,
} from "./mapping";

export type {
  KrakenContract, KrakenFill, KrakenFundingRate, KrakenFuturesAccount,
  KrakenOpenPosition, KrakenOrderInput, KrakenTicker,
} from "./mapping";

const ID = "kraken";
const invalid = (message: string) => new BrokerError("invalid_request", message, { provider: ID });

export const KRAKEN_INFO: ProviderInfo = {
  id: ID,
  name: "Kraken Futures",
  logo: "https://www.google.com/s2/favicons?domain=kraken.com&sz=64",
  description: "Futuros perpetuos lineales (PF_…USD). Consulta tu saldo, garantía y posiciones.",
  availability: "available",
  environments: ["real", "demo"],
  markets: ["crypto"],
  capabilities: ["accounts", "positions", "orders", "executions", "instruments"],
  orderTypes: [],
  credentialFields: [
    {
      key: "apiKey", label: "Futures API Key", secret: true,
      help: "Kraken Derivatives > Settings > API > Create Key. General API: Read Only ahora o Full Access para futuras órdenes; Withdrawal API: No Access.",
    },
    { key: "apiSecret", label: "Futures API Secret (base64)", secret: true, help: "Secreto de la clave de Futures; no sirve la clave API de Kraken Spot." },
  ],
  notes: [
    "Conecta una clave de Kraken Futures, no de Kraken Spot. General API: Read Only para consultar o Full Access para una fase futura de operaciones.",
    "No concedas permisos de retiros ni transferencias a esta clave.",
    "Fase actual: solo lectura. Las órdenes, incluidas las automáticas, permanecen deshabilitadas desde CRS.",
    "Contratos PF_<moneda>USD (Bitcoin = XBT). Cotizan en USD; el saldo solo se convierte a EUR si Kraken proporciona una valoración EUR/USD fiable.",
    "Los perpetuos tienen funding y riesgo de liquidación incluso a 1x; el control de apalancamiento deberá validarse antes de habilitar órdenes.",
  ],
};

/**
 * Standalone Futures client for a later, separately reviewed trading phase.
 * Deliberately NOT exposed via BrokerAdapter or the CRS order gateway today.
 */
export function createKrakenFuturesClient(deps: KrakenApiDeps = defaultKrakenDeps()) {
  const request = createKrakenApi(deps);

  async function getAccount(session: BrokerSession): Promise<KrakenFuturesAccount> {
    return mapAccount(await request(session, "accounts"), session.environment).raw;
  }

  async function getTicker(session: BrokerSession, symbol: string): Promise<KrakenTicker> {
    const code = krakenSymbol(symbol);
    const response = await request(session, `tickers/${code}`, { public: true });
    return mapTicker(response.ticker);
  }

  async function getPerpetualContracts(session: BrokerSession): Promise<KrakenContract[]> {
    const response = await request(session, "instruments", { public: true });
    return mapContracts(response.instruments);
  }

  async function getOpenPositions(session: BrokerSession): Promise<KrakenOpenPosition[]> {
    return mapPositions((await request(session, "openpositions")).openPositions);
  }

  async function getOpenOrders(session: BrokerSession) {
    return mapOrders((await request(session, "openorders")).openOrders);
  }

  async function getFills(session: BrokerSession, since?: string): Promise<KrakenFill[]> {
    if (since && !Number.isFinite(Date.parse(since))) throw invalid("Fecha since no válida; utiliza una fecha ISO 8601.");
    // /fills does not document a `since` query parameter. Filter locally.
    const fills = mapFills((await request(session, "fills")).fills);
    return since ? fills.filter((fill) => fill.timestamp !== null && Date.parse(fill.timestamp) >= Date.parse(since)) : fills;
  }

  async function getFundingRates(session: BrokerSession, symbol: string): Promise<KrakenFundingRate[]> {
    const code = krakenSymbol(symbol);
    const response = await request(session, "historical-funding-rates", { public: true, params: { symbol: code } });
    return mapFundingRates(response.rates, code);
  }

  async function placeOrder(session: BrokerSession, order: KrakenOrderInput): Promise<string> {
    if (!isKrakenPerpetual(order.symbol)) throw invalid("Solo se admiten contratos perpetuos PF_…USD.");
    if (order.side !== "buy" && order.side !== "sell") throw invalid("Lado de orden no válido.");
    if (!["lmt", "stp", "mkt"].includes(order.type)) throw invalid("Tipo de orden no válido.");
    if (!Number.isFinite(order.size) || order.size <= 0) throw invalid("La cantidad debe ser positiva.");
    if (order.postOnly && order.type !== "lmt") throw invalid("postOnly solo admite órdenes limitadas.");
    if (order.type === "lmt" && (!Number.isFinite(order.limitPrice) || (order.limitPrice ?? 0) <= 0)) throw invalid("Falta un precio límite válido.");
    if (order.type === "stp" && (!Number.isFinite(order.stopPrice) || (order.stopPrice ?? 0) <= 0)) throw invalid("Falta un precio stop válido.");
    const params: Record<string, string> = {
      symbol: order.symbol, side: order.side, size: String(order.size),
      orderType: order.postOnly ? "post" : order.type,
    };
    if (order.limitPrice !== undefined) {
      if (!Number.isFinite(order.limitPrice) || order.limitPrice <= 0) throw invalid("Precio límite no válido.");
      params.limitPrice = String(order.limitPrice);
    }
    if (order.stopPrice !== undefined) {
      if (!Number.isFinite(order.stopPrice) || order.stopPrice <= 0) throw invalid("Precio stop no válido.");
      params.stopPrice = String(order.stopPrice);
    }
    if (order.reduceOnly !== undefined) params.reduceOnly = String(order.reduceOnly);
    const response = await request(session, "sendorder", { method: "POST", params });
    const status = response.sendStatus;
    const row = status && typeof status === "object" ? status as Record<string, unknown> : null;
    if (row?.status !== "placed" && row?.status !== "filled") {
      throw new BrokerError("unknown_outcome", "Kraken Futures no confirmó la creación de la orden. Consulta las órdenes abiertas.", { provider: ID });
    }
    if (typeof row.order_id !== "string" || !row.order_id) {
      throw new BrokerError("unknown_outcome", "Kraken Futures no devolvió el ID de la orden.", { provider: ID });
    }
    return row.order_id;
  }

  async function cancelOrder(session: BrokerSession, id: string): Promise<void> {
    if (!/^[A-Za-z0-9-]{8,80}$/.test(id)) throw invalid("Identificador de orden no válido.");
    const response = await request(session, "cancelorder", { method: "POST", params: { order_id: id } });
    const status = response.cancelStatus;
    const row = status && typeof status === "object" ? status as Record<string, unknown> : null;
    if (row?.status !== "cancelled") throw new BrokerError("unknown_outcome", "No se pudo confirmar la cancelación en Kraken Futures.", { provider: ID });
  }

  return { getAccount, getTicker, getPerpetualContracts, placeOrder, cancelOrder, getOpenOrders, getOpenPositions, getFills, getFundingRates };
}

export function createKrakenAdapter(deps: KrakenApiDeps = defaultKrakenDeps()): BrokerAdapter {
  const client = createKrakenFuturesClient(deps);

  return {
    info: KRAKEN_INFO,

    async connect(session) {
      // Kraken checks the key and identifies the multi-collateral Futures account.
      const raw = await client.getAccount(session);
      return {
        accountId: raw.accountId, label: "Kraken Futures · Multicollateral", environment: session.environment,
        currency: raw.currency, cashAvailable: raw.availableMargin, totalValue: raw.balance, investedValue: null,
      };
    },

    async getAccounts(session) {
      return [await this.connect(session)];
    },

    async getPositions(session) {
      const positions = await client.getOpenPositions(session);
      const quotes = await Promise.all(positions.map(async (position) => {
        try { return await client.getTicker(session, position.symbol); }
        catch { return undefined; }
      }));
      return positions.map((position, index) => toBrokerPosition(position, quotes[index]));
    },

    getOrders: (session) => client.getOpenOrders(session),

    async getExecutions(session, { limit }) {
      const all = (await client.getFills(session)).map(toBrokerExecution);
      return all.sort((a, b) => (b.executedAt ?? "").localeCompare(a.executedAt ?? ""))
        .slice(0, Math.max(1, Math.min(100, Math.floor(limit))));
    },

    async resolveSymbol(session, ref) {
      if (ref.market !== "crypto") return { status: "unsupported", reason: "Kraken Futures solo ofrece perpetuos cripto." };
      let code: string;
      try { code = krakenSymbol(ref.symbol); }
      catch { return { status: "not_found" }; }
      const found = (await client.getPerpetualContracts(session)).find((contract) => contract.symbol === code);
      return found ? { status: "ok", instrument: toInstrument(found), how: "contrato perpetual de Kraken Futures" } : { status: "not_found" };
    },

    async searchInstruments(session, query) {
      const term = query.trim().toUpperCase();
      if (term.length < 2) return [];
      return (await client.getPerpetualContracts(session))
        .filter((contract) => contract.symbol.includes(term) || contract.base.includes(term) || (term === "BTC" && baseOf(contract.symbol) === "BTC"))
        .slice(0, 20).map(toInstrument);
    },
    // Intentionally no placeOrder/cancelOrder: public UI and automations stay read-only.
  };
}
