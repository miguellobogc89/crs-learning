// lib/brokers/adapter.ts
// Interfaz que implementa cada proveedor. Un adaptador traduce entre el contrato común y la API
// del bróker: autenticación, símbolos, órdenes, respuestas, errores y límites. No decide qué
// comprar ni cuánto, ni comprueba permisos de CRS: eso lo hacen quien llama y el gateway.
import type {
  BrokerAccount,
  BrokerCapability,
  BrokerEnvironment,
  BrokerExecution,
  BrokerInstrument,
  BrokerOrder,
  BrokerPosition,
  InstrumentRef,
  OrderSide,
  OrderStatus,
  OrderType,
  ProviderInfo,
  SymbolResolution,
  TimeInForce,
} from "./types";

/** Lo que recibe el adaptador en cada llamada: credenciales ya descifradas y el entorno fijo de la conexión. */
export type BrokerSession = {
  connectionId: string;
  environment: BrokerEnvironment;
  credentials: Record<string, string>;
};

/** Orden ya validada y con el símbolo del proveedor resuelto. */
export type AdapterOrder = {
  providerSymbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  limitPrice: number | null;
  stopPrice: number | null;
  timeInForce: TimeInForce;
  /**
   * Identificador de la orden puesto por CRS (derivado de la clave de idempotencia). Los proveedores
   * que lo admiten lo envían: así se puede averiguar qué pasó con una orden de resultado incierto.
   */
  clientOrderId: string;
};

export type AdapterOrderResult = { orderId: string; status: OrderStatus; providerStatus: string | null };

/**
 * Cada método opcional corresponde a una capacidad. Si el proveedor no la tiene, no se implementa
 * (y no se declara en `info.capabilities`): el gateway responde «unsupported» sin llamar a nada.
 */
export interface BrokerAdapter {
  readonly info: ProviderInfo;
  /** Comprueba las credenciales y devuelve la cuenta que queda vinculada. No envía órdenes. */
  connect(session: BrokerSession): Promise<BrokerAccount>;
  /**
   * Credenciales del propio servidor (variables de entorno), solo para desarrollo local con cuentas demo.
   * null si no hay. Permite seguir usando la clave del .env como una conexión más.
   */
  serverCredentials?(environment: BrokerEnvironment): Record<string, string> | null;
  /** Limpieza del lado del proveedor (revocar tokens…), si la hay. */
  disconnect?(session: BrokerSession): Promise<void>;
  getAccounts?(session: BrokerSession): Promise<BrokerAccount[]>;
  getPositions?(session: BrokerSession): Promise<BrokerPosition[]>;
  getOrders?(session: BrokerSession): Promise<BrokerOrder[]>;
  getExecutions?(session: BrokerSession, opts: { limit: number }): Promise<BrokerExecution[]>;
  /** Vincula un símbolo de CRS con el del proveedor. */
  resolveSymbol?(session: BrokerSession, ref: InstrumentRef & { isin?: string | null }): Promise<SymbolResolution>;
  searchInstruments?(session: BrokerSession, query: string): Promise<BrokerInstrument[]>;
  /**
   * Envía la orden UNA vez. Nunca reintenta: si no sabe si llegó, lanza BrokerError «unknown_outcome».
   */
  placeOrder?(session: BrokerSession, order: AdapterOrder): Promise<AdapterOrderResult>;
  /** null si el proveedor ya no la conoce. */
  getOrder?(session: BrokerSession, orderId: string): Promise<BrokerOrder | null>;
  cancelOrder?(session: BrokerSession, orderId: string): Promise<void>;
  /**
   * Busca una orden por el identificador que puso CRS (si el proveedor lo admite). Lo usa el gateway
   * para resolver órdenes de resultado incierto sin reenviarlas. null si el proveedor no la conoce.
   */
  findOrderByClientId?(session: BrokerSession, order: { providerSymbol: string; clientOrderId: string }): Promise<BrokerOrder | null>;
}

/** Método que implementa cada capacidad (para comprobar que lo declarado coincide con lo implementado). */
export const CAPABILITY_METHOD: Record<BrokerCapability, keyof BrokerAdapter> = {
  accounts: "getAccounts",
  positions: "getPositions",
  orders: "getOrders",
  executions: "getExecutions",
  instruments: "resolveSymbol",
  place_order: "placeOrder",
  order_status: "getOrder",
  cancel_order: "cancelOrder",
};
