// Conector Trading 212: cuenta Demo, lecturas y órdenes confirmadas (solo localhost).
import "server-only";

const DEMO_API = "https://demo.trading212.com/api/v0";

export type Trading212DemoSummary = {
  environment: "demo";
  currency: string;
  availableToTrade: number;
  totalValue: number;
  investedValue: number;
};

export type Trading212DemoPosition = {
  ticker: string | null;
  name: string | null;
  quantity: number;
  quantityAvailableForTrading: number | null;
  averagePricePaid: number;
  currentPrice: number;
};

export class Trading212Error extends Error {
  constructor(message: string, public readonly status = 502) {
    super(message);
    this.name = "Trading212Error";
  }
}

type DemoOrderRequest =
  | { method: "POST"; body: { ticker: string; quantity: number; extendedHours: false } }
  | { method: "POST"; body: { ticker: string; quantity: number; stopPrice: number; timeValidity: "GOOD_TILL_CANCEL" } }
  | { method: "POST"; body: { ticker: string; quantity: number; limitPrice: number; timeValidity: "GOOD_TILL_CANCEL" } }
  | { method: "DELETE" };

async function fetchDemo(
  path: string,
  options?: DemoOrderRequest,
): Promise<unknown> {
  const fixedPaths = ["/equity/account/summary", "/equity/positions", "/equity/orders",
    "/equity/metadata/instruments", "/equity/orders/market", "/equity/orders/stop", "/equity/orders/limit"];
  const orderId = path.startsWith("/equity/orders/") ? path.slice("/equity/orders/".length) : "";
  const isOrderId = orderId.length > 0 && [...orderId].every(ch => ch >= "0" && ch <= "9");
  if (!fixedPaths.includes(path) && !isOrderId) {
    throw new Trading212Error("Endpoint de Trading 212 no permitido", 400);
  }
  if (process.env.TRADING212_ENV !== "demo") {
    throw new Trading212Error("Trading 212 debe estar configurado en modo demo", 503);
  }
  const key = process.env.TRADING212_API_KEY;
  const secret = process.env.TRADING212_API_SECRET;
  if (!key || !secret) {
    throw new Trading212Error("Faltan TRADING212_API_KEY o TRADING212_API_SECRET", 503);
  }

  let response: Response;
  try {
    response = await fetch(`${DEMO_API}${path}`, {
      method: options?.method ?? "GET",
      headers: {
        Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`,
        Accept: "application/json",
        ...(options ? { "Content-Type": "application/json" } : {}),
      },
      ...(options?.method === "POST" ? { body: JSON.stringify(options.body) } : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Trading212Error("No se pudo conectar con Trading 212 Demo");
  }

  if (response.status === 429) {
    throw new Trading212Error("Límite de consultas alcanzado; inténtalo pasados unos segundos", 429);
  }
  if (response.status === 401 || response.status === 403) {
    throw new Trading212Error("Trading 212 rechazó las credenciales o los permisos de lectura", 502);
  }
  if (!response.ok) {
    throw new Trading212Error(`Trading 212 devolvió un error HTTP ${response.status}`);
  }

  if (options?.method === "DELETE") {
    // DELETE puede devolver un cuerpo vacío. Un 2xx confirma recepción, no ejecución.
    return { ok: true };
  }
  try {
    return await response.json();
  } catch {
    throw new Trading212Error("Trading 212 devolvió una respuesta no válida");
  }
}

type DemoReadPath = "/equity/account/summary" | "/equity/positions" | "/equity/orders";

/** Cache corta + deduplicación: evita llamadas simultáneas repetidas en React y respeta los límites del bróker. */
const demoReadCache = new Map<DemoReadPath, {
  value?: unknown;
  expiresAt: number;
  pending?: Promise<unknown>;
}>();

async function readDemo(path: DemoReadPath, ttlMs: number): Promise<unknown> {
  const cached = demoReadCache.get(path);
  if (cached?.pending) return cached.pending;
  if (cached?.value !== undefined && cached.expiresAt > Date.now()) return cached.value;

  const pending = (async () => {
    try {
      return await fetchDemo(path);
    } catch (e) {
      // Las lecturas sí pueden reintentarse; nunca hacemos esto con las órdenes POST.
      if (!(e instanceof Trading212Error) || e.status !== 429) throw e;
      await new Promise<void>((resolve) => setTimeout(resolve, 5_300));
      return fetchDemo(path);
    }
  })();
  demoReadCache.set(path, { ...cached, pending, expiresAt: 0 });
  try {
    const value = await pending;
    demoReadCache.set(path, { value, expiresAt: Date.now() + ttlMs });
    return value;
  } catch (e) {
    demoReadCache.delete(path);
    throw e;
  }
}

const isAmount = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Consulta exclusivamente el saldo Demo, sin exponer credenciales ni el identificador de cuenta. */
export async function getTrading212DemoSummary(): Promise<Trading212DemoSummary> {
  const data = (await readDemo("/equity/account/summary", 6_000)) as {
    currency?: unknown;
    totalValue?: unknown;
    cash?: { availableToTrade?: unknown };
    investments?: { currentValue?: unknown };
  } | null;

  if (
    !data ||
    typeof data.currency !== "string" ||
    !isAmount(data.cash?.availableToTrade) ||
    !isAmount(data.totalValue) ||
    !isAmount(data.investments?.currentValue)
  ) {
    throw new Trading212Error("Trading 212 devolvió datos de cuenta incompletos");
  }

  return {
    environment: "demo",
    currency: data.currency,
    availableToTrade: data.cash.availableToTrade,
    totalValue: data.totalValue,
    investedValue: data.investments.currentValue,
  };
}

/** Posiciones abiertas en Demo. No modifica órdenes ni la cartera virtual. */
export async function getTrading212DemoPositions(fresh = false): Promise<{
  environment: "demo";
  items: Trading212DemoPosition[];
}> {
  let data: unknown;
  if (fresh) {
    try {
      data = await fetchDemo("/equity/positions");
    } catch (e) {
      // La lectura de posiciones tiene límite de 1 consulta/segundo.
      // Reintenta solo la consulta GET de validación, nunca la orden de venta.
      if (!(e instanceof Trading212Error) || e.status !== 429) throw e;
      await new Promise<void>((resolve) => setTimeout(resolve, 1_300));
      data = await fetchDemo("/equity/positions");
    }
  } else {
    data = await readDemo("/equity/positions", 2_000);
  }
  if (!Array.isArray(data)) throw new Trading212Error("Trading 212 devolvió posiciones no válidas");

  const items: Trading212DemoPosition[] = data.map((value: unknown) => {
    const p = value as {
      instrument?: { ticker?: unknown; name?: unknown };
      quantity?: unknown;
      quantityAvailableForTrading?: unknown;
      averagePricePaid?: unknown;
      currentPrice?: unknown;
    } | null;
    if (!p || !isAmount(p.quantity) || !isAmount(p.averagePricePaid) || !isAmount(p.currentPrice)) {
      throw new Trading212Error("Trading 212 devolvió una posición incompleta");
    }
    return {
      ticker: typeof p.instrument?.ticker === "string" ? p.instrument.ticker : null,
      name: typeof p.instrument?.name === "string" ? p.instrument.name : null,
      quantity: p.quantity,
      quantityAvailableForTrading: isAmount(p.quantityAvailableForTrading) ? p.quantityAvailableForTrading : null,
      averagePricePaid: p.averagePricePaid,
      currentPrice: p.currentPrice,
    };
  });

  return { environment: "demo", items };
}


export type Trading212DemoOrder = {
  id: number;
  ticker: string;
  side: "BUY" | "SELL";
  type: string;
  status: string;
  quantity: number;
  stopPrice: number | null;
  limitPrice: number | null;
  initiatedFrom: string | null;
};

/** Órdenes pendientes en Demo. Verifica además el permiso de lectura de órdenes. */
export async function getTrading212DemoOrders(): Promise<{
  environment: "demo";
  items: Trading212DemoOrder[];
}> {
  const data = await readDemo("/equity/orders", 6_000);
  if (!Array.isArray(data)) throw new Trading212Error("Trading 212 devolvió órdenes no válidas");

  const items: Trading212DemoOrder[] = data.map((value: unknown) => {
    const order = value as {
      id?: unknown;
      ticker?: unknown;
      side?: unknown;
      type?: unknown;
      status?: unknown;
      quantity?: unknown;
      stopPrice?: unknown;
      limitPrice?: unknown;
      initiatedFrom?: unknown;
    } | null;
    if (!order || !isAmount(order.id) || typeof order.ticker !== "string" ||
      (order.side !== "BUY" && order.side !== "SELL") ||
      typeof order.type !== "string" || typeof order.status !== "string" ||
      !isAmount(order.quantity)) {
      throw new Trading212Error("Trading 212 devolvió una orden incompleta");
    }
    return {
      id: order.id,
      ticker: order.ticker,
      side: order.side,
      type: order.type,
      status: order.status,
      quantity: order.quantity,
      stopPrice: isAmount(order.stopPrice) ? order.stopPrice : null,
      limitPrice: isAmount(order.limitPrice) ? order.limitPrice : null,
      initiatedFrom: typeof order.initiatedFrom === "string" ? order.initiatedFrom : null,
    };
  });
  return { environment: "demo", items };
}


export type Trading212InstrumentMatch = {
  ticker: string;
  name: string;
  isin: string;
  currency: string;
  type: "STOCK";
};

type Trading212RawInstrument = {
  ticker?: unknown;
  name?: unknown;
  shortName?: unknown;
  isin?: unknown;
  currencyCode?: unknown;
  type?: unknown;
};

let instrumentsCache: { expiresAt: number; items: Trading212RawInstrument[] } | null = null;
let instrumentsPending: Promise<Trading212RawInstrument[]> | null = null;

async function demoInstruments(): Promise<Trading212RawInstrument[]> {
  if (instrumentsCache && Date.now() < instrumentsCache.expiresAt) return instrumentsCache.items;
  if (!instrumentsPending) {
    instrumentsPending = (async () => {
      const result = await fetchDemo("/equity/metadata/instruments");
      if (!Array.isArray(result)) throw new Trading212Error("Trading 212 devolvió instrumentos no válidos");
      const items = result as Trading212RawInstrument[];
      // Trading 212 limita la consulta a una cada 50 segundos.
      instrumentsCache = { items, expiresAt: Date.now() + 10 * 60_000 };
      return items;
    })().finally(() => { instrumentsPending = null; });
  }
  return instrumentsPending;
}

/** Correspondencia tentativa; devolver candidatos no autoriza automáticamente una orden. */
export async function findTrading212DemoInstruments(symbol: string): Promise<{
  environment: "demo";
  symbol: string;
  matches: Trading212InstrumentMatch[];
  catalogCount: number;
  spanishStockCount: number;
}> {
  const clean = symbol.trim().toUpperCase();
  const match = /^([A-Z0-9]{1,12})[.]MC$/.exec(clean);
  if (!match) throw new Trading212Error("Solo se admiten símbolos de bolsa española como IBE.MC", 400);
  const base = match[1];

  // El ticker de Trading 212 no tiene por qué coincidir con el de Yahoo Finance.
  // Para Iberdrola priorizamos su ISIN oficial, no un patrón supuesto de ticker.
  const isin = clean === "IBE.MC" ? "ES0144580Y14" : null;
  const companyName = clean === "IBE.MC" ? "IBERDROLA" : null;
  const items = await demoInstruments();

  const stocks = items.filter((item) => item.type === "STOCK");
  const candidates = stocks.filter((item) => {
    const ticker = typeof item.ticker === "string" ? item.ticker.toUpperCase() : "";
    const shortName = typeof item.shortName === "string" ? item.shortName.toUpperCase() : "";
    const name = typeof item.name === "string" ? item.name.toUpperCase() : "";
    const code = typeof item.isin === "string" ? item.isin.toUpperCase() : "";
    if (isin && code === isin) return true;
    if (companyName && name.includes(companyName)) return true;
    // Coincidencia de ticker más flexible. No equivale a una validación para enviar órdenes.
    return shortName === base ||
      ticker === base || ticker.startsWith(`${base}_`) || ticker.startsWith(`${base}.`);
  });

  const matches = candidates
    .filter((item): item is Trading212RawInstrument & {
      ticker: string; name: string; isin: string; currencyCode: string;
    } => typeof item.ticker === "string" && typeof item.name === "string" &&
      typeof item.isin === "string" && typeof item.currencyCode === "string")
    .slice(0, 20)
    .map((item) => ({
      ticker: item.ticker,
      name: item.name,
      isin: item.isin,
      currency: item.currencyCode,
      type: "STOCK" as const,
    }));

  return {
    environment: "demo",
    symbol: clean,
    matches,
    catalogCount: items.length,
    spanishStockCount: stocks.filter((item) => typeof item.isin === "string" && item.isin.startsWith("ES")).length,
  };
}


// Primer ensayo controlado: exclusivamente una acción ficticia de Iberdrola.
let lastDemoBuyAttemptAt = 0;

export async function buyOneIberdrolaInTrading212Demo(): Promise<{
  environment: "demo";
  symbol: "IBE.MC";
  ticker: "IBEe_EQ";
  orderId: number;
  status: string;
  quantity: 1;
}> {
  // No se habilitan operaciones con dinero real ni en servidores desplegados.
  if (process.env.NODE_ENV !== "development" || process.env.TRADING212_ENV !== "demo") {
    throw new Trading212Error("Las compras están limitadas a Trading 212 Demo en localhost", 403);
  }
  if (conditionalInFlight.has("IBEe_EQ") || demoSellInFlight.has("IBEe_EQ")) {
    throw new Trading212Error("Ya hay otra operación en curso para Iberdrola", 409);
  }
  const mapping = await findTrading212DemoInstruments("IBE.MC");
  const verified = mapping.matches.filter(m =>
    m.ticker === "IBEe_EQ" && m.isin === "ES0144580Y14" && m.currency === "EUR",
  );
  if (verified.length !== 1) {
    throw new Trading212Error("No se pudo verificar de forma inequívoca Iberdrola en Trading 212", 409);
  }

  // La API de órdenes no es idempotente. No se reintentan peticiones fallidas.
  // Bloqueo preventivo ante doble clic/reenvío durante un minuto.
  if (Date.now() - lastDemoBuyAttemptAt < 60_000) {
    throw new Trading212Error("Ya se intentó enviar una compra hace menos de un minuto: comprueba antes la cartera", 429);
  }
  lastDemoBuyAttemptAt = Date.now();

  const result = (await fetchDemo("/equity/orders/market", {
    method: "POST",
    body: { ticker: "IBEe_EQ", quantity: 1, extendedHours: false },
  })) as { id?: unknown; status?: unknown } | null;

  if (!result || !isAmount(result.id) || typeof result.status !== "string") {
    throw new Trading212Error("Resultado de orden desconocido: consulta la cartera y las órdenes antes de repetir");
  }
  // Una compra puede cambiar saldo, posiciones y órdenes pendientes.
  demoReadCache.clear();
  return {
    environment: "demo",
    symbol: "IBE.MC",
    ticker: "IBEe_EQ",
    orderId: result.id,
    status: result.status,
    quantity: 1,
  };
}


/**
 * Vende una cantidad de una posición existente, exclusivamente en Demo.
 * La operación se verifica contra las posiciones actuales del bróker, no contra
 * los datos del navegador. Un fallo de red no debe provocar un reintento del POST.
 */
const demoSellInFlight = new Set<string>();
const lastDemoSellAttempt = new Map<string, number>();

export async function sellTrading212DemoPosition(ticker: string, quantity: number): Promise<{
  environment: "demo";
  ticker: string;
  quantity: number;
  orderId: number;
  status: string;
}> {
  if (process.env.NODE_ENV !== "development" || process.env.TRADING212_ENV !== "demo") {
    throw new Trading212Error("Las ventas están limitadas a Trading 212 Demo en localhost", 403);
  }
  if (typeof ticker !== "string" || ticker.length > 80 || !/^[A-Za-z0-9_.-]+$/.test(ticker) ||
      !isAmount(quantity) || quantity <= 0) {
    throw new Trading212Error("Ticker o cantidad de venta no válidos", 400);
  }

  // Bloquea solicitudes simultáneas al mismo valor, incluso durante la validación.
  if (demoSellInFlight.has(ticker) || conditionalInFlight.has(ticker)) {
    throw new Trading212Error("Ya se está procesando una venta de este valor; comprueba su estado", 409);
  }
  if (Date.now() - (lastDemoSellAttempt.get(ticker) ?? 0) < 60_000) {
    throw new Trading212Error("Ya se intentó vender este valor hace menos de un minuto; consulta las órdenes antes de repetir", 429);
  }
  demoSellInFlight.add(ticker);
  try {
    // Consulta sin cache para evitar vender acciones ya reservadas por otra orden.
    const freshPositions = await getTrading212DemoPositions(true);
    const position = freshPositions.items.find(p => p.ticker === ticker);
    const available = position?.quantityAvailableForTrading;
    if (!position || available === null || available === undefined || available <= 0) {
      throw new Trading212Error("La posición ya no existe o no tiene acciones disponibles para vender", 409);
    }
    if (quantity > available + 1e-8 || quantity > position.quantity + 1e-8) {
      throw new Trading212Error("La cantidad solicitada supera la disponible; actualiza la cartera", 409);
    }

    // La API exige una cantidad NEGATIVA para las órdenes de venta.
    lastDemoSellAttempt.set(ticker, Date.now());
    const result = (await fetchDemo("/equity/orders/market", {
      method: "POST",
      body: { ticker, quantity: -quantity, extendedHours: false },
    })) as { id?: unknown; status?: unknown } | null;

    if (!result || !isAmount(result.id) || typeof result.status !== "string") {
      throw new Trading212Error("Resultado de venta desconocido: consulta la cartera y las órdenes antes de repetir");
    }
    return {
      environment: "demo",
      ticker,
      quantity,
      orderId: result.id,
      status: result.status,
    };
  } finally {
    demoReadCache.clear();
    demoSellInFlight.delete(ticker);
  }
}


export type Trading212ConditionalKind = "sell_stop" | "sell_limit" | "buy_limit" | "buy_stop";
const conditionalInFlight = new Set<string>();
const conditionalAttemptAt = new Map<string, number>();

/**
 * STOP de venta (pérdida), LIMIT de venta (objetivo) o compras a precio condicionado.
 * La API no proporciona una vinculación OCO: nunca abre dos ventas por el mismo valor.
 * Una orden condicional se queda en el bróker aunque se cierre localhost.
 */
export async function placeTrading212DemoConditionalOrder(input: {
  kind: Trading212ConditionalKind;
  ticker: string;
  quantity: number;
  price: number;
}): Promise<{
  environment: "demo";
  orderId: number;
  status: string;
  kind: Trading212ConditionalKind;
  ticker: string;
}> {
  if (process.env.NODE_ENV !== "development" || process.env.TRADING212_ENV !== "demo") {
    throw new Trading212Error("Solo se permiten órdenes condicionadas de la cuenta Demo local", 403);
  }
  const { kind, ticker, quantity, price } = input;
  if (!["sell_stop", "sell_limit", "buy_limit", "buy_stop"].includes(kind) ||
      typeof ticker !== "string" || ticker.length > 80 || !/^[A-Za-z0-9_.-]+$/.test(ticker) ||
      !isAmount(quantity) || quantity <= 0 || quantity > 1_000 ||
      !isAmount(price) || price <= 0 || price > 1_000_000) {
    throw new Trading212Error("Orden condicional no válida", 400);
  }
  const lockKey = ticker;
  if (conditionalInFlight.has(lockKey) || demoSellInFlight.has(ticker)) {
    throw new Trading212Error("Ya se está procesando otra operación de este valor", 409);
  }
  if (Date.now() - (conditionalAttemptAt.get(lockKey) ?? 0) < 60_000) {
    throw new Trading212Error("Se intentó enviar una orden de este valor recientemente; revisa las pendientes", 429);
  }
  conditionalInFlight.add(lockKey);
  try {
    // Comprueba también órdenes creadas directamente en Trading 212.
    demoReadCache.delete("/equity/orders");
    const existing = (await getTrading212DemoOrders()).items.filter(o => o.ticker === ticker);
    if (existing.some(o => o.side === (kind.startsWith("sell") ? "SELL" : "BUY"))) {
      throw new Trading212Error("Ya hay una orden pendiente del mismo sentido para este instrumento. Cancélala antes.", 409);
    }

    if (kind.startsWith("sell")) {
      const positions = await getTrading212DemoPositions(true);
      const p = positions.items.find(p => p.ticker === ticker);
      if (!p || p.quantityAvailableForTrading === null || quantity > p.quantityAvailableForTrading + 1e-8) {
        throw new Trading212Error("No hay suficientes acciones libres para crear la venta condicionada", 409);
      }
      if (kind === "sell_stop" && price >= p.currentPrice) {
        throw new Trading212Error("El stop de venta debe estar por debajo del precio actual", 400);
      }
      if (kind === "sell_limit" && price <= p.currentPrice) {
        throw new Trading212Error("El objetivo de venta debe estar por encima del precio actual", 400);
      }
    } else {
      // Primera fase: solo instrumento ya contrastado por ticker e ISIN en Demo.
      if (ticker !== "IBEe_EQ") {
        throw new Trading212Error("Por seguridad, la compra programada Demo solo admite Iberdrola por ahora", 400);
      }
      const mapped = await findTrading212DemoInstruments("IBE.MC");
      if (!mapped.matches.some(m => m.ticker === ticker && m.isin === "ES0144580Y14")) {
        throw new Trading212Error("No se pudo validar Iberdrola mediante el ISIN", 409);
      }
      const account = await getTrading212DemoSummary();
      // Tope conservador: 20% del patrimonio total y como máximo el efectivo disponible.
      if (account.currency !== "EUR" || quantity * price > Math.min(account.availableToTrade, account.totalValue * 0.2) + 1e-8) {
        throw new Trading212Error("La compra supera el efectivo o el límite del 20 % del patrimonio Demo", 400);
      }
      const positions = await getTrading212DemoPositions(true);
      if (positions.items.some(p => p.ticker === ticker && p.quantity > 0)) {
        throw new Trading212Error("Ya hay posición en este valor; no se crea otra compra programada automáticamente", 409);
      }
    }

    // Nunca reintentar POST: la API de Trading 212 no garantiza idempotencia.
    conditionalAttemptAt.set(lockKey, Date.now());
    const isStop = kind.endsWith("stop");
    const path = isStop ? "/equity/orders/stop" : "/equity/orders/limit";
    const signedQuantity = kind.startsWith("sell") ? -quantity : quantity;
    const request: DemoOrderRequest = isStop
      ? { method: "POST", body: { ticker, quantity: signedQuantity, stopPrice: price, timeValidity: "GOOD_TILL_CANCEL" } }
      : { method: "POST", body: { ticker, quantity: signedQuantity, limitPrice: price, timeValidity: "GOOD_TILL_CANCEL" } };
    const result = (await fetchDemo(path, request)) as { id?: unknown; status?: unknown } | null;
    if (!result || !isAmount(result.id) || typeof result.status !== "string") {
      throw new Trading212Error("Resultado de orden desconocido: revisa las pendientes antes de repetir");
    }
    return { environment: "demo", orderId: result.id, status: result.status, kind, ticker };
  } finally {
    demoReadCache.clear();
    conditionalInFlight.delete(lockKey);
  }
}

export async function cancelTrading212DemoOrder(id: number): Promise<{ environment: "demo"; id: number; requested: true }> {
  if (process.env.NODE_ENV !== "development" || process.env.TRADING212_ENV !== "demo") {
    throw new Trading212Error("Solo se permiten cancelaciones en Trading 212 Demo local", 403);
  }
  if (!Number.isSafeInteger(id) || id < 1) throw new Trading212Error("ID de orden no válido", 400);
  const key = `cancel:${id}`;
  if (conditionalInFlight.has(key)) throw new Trading212Error("Cancelación ya iniciada", 409);
  conditionalInFlight.add(key);
  try {
    demoReadCache.delete("/equity/orders");
    const pending = (await getTrading212DemoOrders()).items.find(o => o.id === id);
    if (!pending) throw new Trading212Error("La orden ya no figura entre las pendientes", 409);
    if (pending.initiatedFrom !== "API") {
      throw new Trading212Error("Solo se pueden cancelar desde CRS las órdenes creadas mediante API", 403);
    }
    await fetchDemo(`/equity/orders/${id}`, { method: "DELETE" });
    return { environment: "demo", id, requested: true };
  } finally {
    demoReadCache.clear();
    conditionalInFlight.delete(key);
  }
}


// ---------------------------------------------------------------------------
// Primitivas para operaciones protegidas y para el comité (solo Demo en localhost).
// No reintentan nunca un POST: la API no garantiza idempotencia.
// ---------------------------------------------------------------------------
function assertDemoLocal() {
  if (process.env.NODE_ENV !== "development" || process.env.TRADING212_ENV !== "demo") {
    throw new Trading212Error("Solo disponible para Trading 212 Demo en localhost", 403);
  }
}

/** ¿Está configurada la Demo para operar desde este servidor? */
export function trading212DemoAvailable() {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.TRADING212_ENV === "demo" &&
    !!process.env.TRADING212_API_KEY &&
    !!process.env.TRADING212_API_SECRET
  );
}

/** Catálogo normalizado (con caché de 10 minutos; el bróker limita esta consulta). */
export async function trading212Catalog() {
  assertDemoLocal();
  const items = await demoInstruments();
  return items
    .filter((i) => typeof i.ticker === "string" && typeof i.name === "string")
    .map((i) => ({
      ticker: i.ticker as string,
      name: i.name as string,
      shortName: typeof i.shortName === "string" ? i.shortName : null,
      isin: typeof i.isin === "string" ? i.isin : null,
      currency: typeof i.currencyCode === "string" ? i.currencyCode : null,
      type: typeof i.type === "string" ? i.type : null,
    }));
}

/** Foto fresca de posiciones y órdenes pendientes (dos lecturas). */
export async function trading212Snapshot() {
  assertDemoLocal();
  const positions = await getTrading212DemoPositions(true);
  demoReadCache.delete("/equity/orders");
  const orders = await getTrading212DemoOrders();
  return { positions: positions.items, orders: orders.items };
}

const brokerOpInFlight = new Set<string>();

async function placeOrder(path: "/equity/orders/market" | "/equity/orders/stop", ticker: string, body: Record<string, unknown>) {
  assertDemoLocal();
  if (!/^[A-Za-z0-9_.-]{1,80}$/.test(ticker)) throw new Trading212Error("Ticker no válido", 400);
  if (brokerOpInFlight.has(ticker) || demoSellInFlight.has(ticker) || conditionalInFlight.has(ticker)) {
    throw new Trading212Error("Ya hay otra operación en curso para este valor", 409);
  }
  brokerOpInFlight.add(ticker);
  try {
    const result = (await fetchDemo(path, { method: "POST", body } as DemoOrderRequest)) as { id?: unknown; status?: unknown } | null;
    if (!result || !isAmount(result.id) || typeof result.status !== "string") {
      throw new Trading212Error("Resultado de orden desconocido: revisa la cartera y las órdenes antes de repetir");
    }
    return { orderId: String(result.id), status: result.status };
  } finally {
    demoReadCache.clear();
    brokerOpInFlight.delete(ticker);
  }
}

/** Compra (cantidad positiva) o venta (negativa) a mercado. */
export async function trading212MarketOrder(ticker: string, signedQuantity: number) {
  if (!isAmount(signedQuantity) || signedQuantity === 0 || Math.abs(signedQuantity) > 100_000) throw new Trading212Error("Cantidad no válida", 400);
  return placeOrder("/equity/orders/market", ticker, { ticker, quantity: signedQuantity, extendedHours: false });
}

/** Stop de venta en el bróker: protege la posición aunque la app esté apagada. */
export async function trading212StopSell(ticker: string, quantity: number, stopPrice: number) {
  if (!isAmount(quantity) || quantity <= 0 || !isAmount(stopPrice) || stopPrice <= 0) throw new Trading212Error("Stop no válido", 400);
  return placeOrder("/equity/orders/stop", ticker, { ticker, quantity: -quantity, stopPrice, timeValidity: "GOOD_TILL_CANCEL" });
}

/** Cancela una orden creada por API (por ejemplo, el stop antes de vender en el objetivo). */
export async function trading212CancelApiOrder(id: string) {
  assertDemoLocal();
  if (!/^\d{1,20}$/.test(id)) throw new Trading212Error("ID de orden no válido", 400);
  await fetchDemo(`/equity/orders/${id}`, { method: "DELETE" });
  demoReadCache.clear();
  return { id, requested: true as const };
}
