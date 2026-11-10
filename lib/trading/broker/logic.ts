// lib/trading/broker/logic.ts
// Reglas puras (sin red ni base de datos) para trabajar con el bróker:
// 1) vincular un valor del IBEX con su instrumento de Trading 212;
// 2) decidir qué hacer con una operación protegida (stop + objetivo) en cada revisión.
//
// Trading 212 no permite stop y objetivo enlazados (OCO) ni dos órdenes de venta sobre el
// mismo valor. Por eso: el STOP vive en el bróker (protege aunque la app esté apagada) y el
// OBJETIVO lo vigila la app; al tocarlo, cancela el stop y vende a mercado.

export type CatalogItem = {
  ticker: string;
  name: string;
  shortName: string | null;
  isin: string | null;
  currency: string | null;
  type: string | null;
};

export type MatchResult =
  | { status: "ok"; item: CatalogItem; how: string }
  | { status: "ambiguo"; candidates: CatalogItem[] }
  | { status: "no_encontrado" };

/**
 * Busca el instrumento de Trading 212 de un valor de la Bolsa de Madrid («SAN.MC»).
 * Convención de Trading 212 para Madrid: ticker «<BASE>e_EQ» (p. ej. IBEe_EQ). Solo se acepta
 * automáticamente cuando hay un único candidato en euros; si no, queda para revisión manual.
 */
export function matchInstrument(symbol: string, catalog: CatalogItem[], knownIsin?: string | null): MatchResult {
  const m = /^([A-Z0-9]{1,12})\.MC$/.exec(symbol.trim().toUpperCase());
  if (!m) return { status: "no_encontrado" };
  const base = m[1];
  const stocks = catalog.filter((c) => (c.type ?? "STOCK") === "STOCK" && (c.currency ?? "EUR") === "EUR");
  if (knownIsin) {
    const byIsin = stocks.filter((c) => c.isin?.toUpperCase() === knownIsin.toUpperCase());
    if (byIsin.length === 1) return { status: "ok", item: byIsin[0], how: "ISIN" };
    if (byIsin.length > 1) return { status: "ambiguo", candidates: byIsin };
  }
  const exact = stocks.filter((c) => c.ticker === `${base}e_EQ`);
  if (exact.length === 1) return { status: "ok", item: exact[0], how: "ticker de Madrid" };
  const loose = stocks.filter((c) => (c.shortName ?? "").toUpperCase() === base);
  if (loose.length === 1) return { status: "ok", item: loose[0], how: "nombre corto" };
  const all = [...new Map([...exact, ...loose].map((c) => [c.ticker, c])).values()];
  return all.length ? { status: "ambiguo", candidates: all.slice(0, 8) } : { status: "no_encontrado" };
}

// ---------------------------------------------------------------------------
// Operaciones protegidas
// ---------------------------------------------------------------------------
export type BracketStatus = "esperando_entrada" | "protegida" | "vendiendo" | "cerrada" | "error";

export type BracketView = {
  status: BracketStatus;
  quantity: number;
  stop: number;
  target: number;
  stopOrderId: string | null;
  /** Motivo de la venta en curso (objetivo o stop saltado en hueco). */
  exitReason: string | null;
  createdAt: number;
};

export type BrokerSnapshot = {
  /** Posición del valor en el bróker, o null si no hay. */
  position: { quantity: number; available: number | null; price: number } | null;
  /** Órdenes pendientes de ese valor. */
  orders: { id: string; side: "BUY" | "SELL"; type: string }[];
};

export type BracketAction =
  | { type: "esperar"; why: string }
  | { type: "poner_stop" }
  | { type: "cancelar_stop_y_vender"; reason: "objetivo" | "stop" }
  | { type: "vender"; reason: string }
  | { type: "cerrar"; reason: string }
  | { type: "error"; reason: string };

/** Qué hacer con una operación protegida a la vista del estado del bróker. */
export function decideBracket(b: BracketView, s: BrokerSnapshot, now = Date.now()): BracketAction {
  const pos = s.position;
  const pendingBuy = s.orders.some((o) => o.side === "BUY");
  const stopPending = b.stopOrderId !== null && s.orders.some((o) => o.id === b.stopOrderId);
  const hasEnough = !!pos && pos.quantity >= b.quantity - 1e-6;
  const freeEnough = !!pos && (pos.available ?? pos.quantity) >= b.quantity - 1e-6;

  if (b.status === "esperando_entrada") {
    if (hasEnough) {
      // Si al entrar el precio ya está por debajo del stop (hueco), se sale directamente.
      if (pos!.price <= b.stop) return freeEnough ? { type: "vender", reason: "stop" } : { type: "esperar", why: "acciones aún no disponibles" };
      return freeEnough ? { type: "poner_stop" } : { type: "esperar", why: "acciones aún no disponibles para vender" };
    }
    if (pendingBuy) return { type: "esperar", why: "la compra sigue pendiente (mercado cerrado o en curso)" };
    if (now - b.createdAt > 15 * 60_000) return { type: "error", reason: "La compra no aparece en la cartera ni entre las órdenes pendientes" };
    return { type: "esperar", why: "esperando a que el bróker registre la compra" };
  }

  if (b.status === "protegida") {
    if (!pos || pos.quantity <= 1e-9) {
      return { type: "cerrar", reason: stopPending ? "vendida fuera de la app" : "stop" };
    }
    if (pos.price >= b.target) return { type: "cancelar_stop_y_vender", reason: "objetivo" };
    if (!stopPending) {
      // El stop ya no está (lo cancelaron a mano o caducó): se vuelve a proteger.
      return freeEnough ? { type: "poner_stop" } : { type: "esperar", why: "acciones reservadas por otra orden" };
    }
    return { type: "esperar", why: "vigilando el objetivo" };
  }

  if (b.status === "vendiendo") {
    if (!pos || pos.quantity <= 1e-9) return { type: "cerrar", reason: b.exitReason ?? "venta" };
    if (stopPending) return { type: "esperar", why: "esperando a que se cancele el stop" };
    if (s.orders.some((o) => o.side === "SELL")) return { type: "esperar", why: "la venta está en curso" };
    return freeEnough ? { type: "vender", reason: b.exitReason ?? "objetivo" } : { type: "esperar", why: "acciones aún reservadas" };
  }

  return { type: "esperar", why: "operación terminada" };
}

/** Tamaño por riesgo sobre el patrimonio de la cuenta del bróker, con topes de exposición y efectivo. */
export function brokerQuantity(input: { equity: number; cash: number; riskPct: number; maxPositionPct: number; price: number; stop: number }) {
  const risk = input.price - input.stop;
  if (!(risk > 0) || !(input.price > 0)) return 0;
  const byRisk = Math.floor((input.equity * input.riskPct) / 100 / risk);
  const byPosition = Math.floor((input.equity * input.maxPositionPct) / 100 / input.price);
  const byCash = Math.floor((input.cash * 0.98) / input.price);
  return Math.max(0, Math.min(byRisk, byPosition, byCash));
}
