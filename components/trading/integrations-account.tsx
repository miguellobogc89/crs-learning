"use client";
// «Ver cuenta» de una conexión: saldo, posiciones, órdenes abiertas e historial tal como los
// devuelve el módulo central (formato común, sea cual sea el bróker), y una orden de prueba.
// Sin lógica de ningún proveedor: lo que se puede hacer sale de sus capacidades y permisos.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2, RefreshCw, Send, X } from "lucide-react";
import type { ConnectionView, ProviderView } from "@/lib/brokers/gateway";
import type { BrokerAccount, BrokerExecution, BrokerOrder, BrokerPosition, OrderSide, OrderType, PlaceOrderResult } from "@/lib/brokers/types";
import { errorText, eur, field, ghost, int, primary, th } from "./format";
import { AssetIcon } from "./asset-icon";
import { ErrorNote, Modal, Pill } from "./ui";

async function brokerApi<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/brokers/${path}`, {
    method: body === undefined ? "GET" : "POST",
    cache: "no-store",
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "No se pudo completar la operación");
  return data as T;
}

type Part<T> = { data: T | null; error: string | null };
const empty = <T,>(): Part<T> => ({ data: null, error: null });
const ORDER_TYPE: Record<string, string> = { market: "A mercado", limit: "Limitada", stop: "Stop", stop_limit: "Stop limitada" };
const STATUS: Record<string, string> = {
  pending_submit: "enviando",
  open: "abierta",
  partially_filled: "ejecutada en parte",
  filled: "ejecutada",
  cancelled: "cancelada",
  rejected: "rechazada",
  expired: "caducada",
  unknown: "sin confirmar",
};
const money = (v: number | null | undefined, currency: string | null | undefined) =>
  v === null || v === undefined ? "—" : currency && currency !== "EUR" ? `${int(Math.round(v * 100) / 100)} ${currency}` : eur(v, 2);
const newKey = () => `manual:${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;

export function AccountModal({ c, provider, onClose, onChanged }: { c: ConnectionView; provider: ProviderView; onClose: () => void; onChanged: () => void }) {
  const can = (cap: string) => provider.capabilities.includes(cap as never);
  const canTrade = c.permissions.includes("trade");
  const [accounts, setAccounts] = useState<Part<BrokerAccount[]>>(empty);
  const [positions, setPositions] = useState<Part<BrokerPosition[]>>(empty);
  const [orders, setOrders] = useState<Part<BrokerOrder[]>>(empty);
  const [executions, setExecutions] = useState<Part<BrokerExecution[]>>(empty);
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const q = `connection=${encodeURIComponent(c.id)}`;
    // Cada parte por separado: si el bróker limita una consulta, el resto se ve igual.
    const part = async <T,>(on: boolean, path: string, set: (p: Part<T>) => void) => {
      if (!on) return;
      try {
        set({ data: (await brokerApi<{ items: T }>(path)).items, error: null });
      } catch (e) {
        set({ data: null, error: errorText(e) });
      }
    };
    await part<BrokerAccount[]>(can("accounts"), `accounts?${q}`, setAccounts);
    await part<BrokerPosition[]>(can("positions"), `positions?${q}`, setPositions);
    await part<BrokerOrder[]>(can("orders"), `orders?${q}`, setOrders);
    await part<BrokerExecution[]>(can("executions"), `executions?${q}&limit=20`, setExecutions);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- las capacidades del proveedor no cambian mientras está abierto
  }, [c.id]);
  useEffect(() => {
    void load();
  }, [load]);

  const cancel = async (orderId: string) => {
    if (!window.confirm(`¿Cancelar la orden ${orderId}?`)) return;
    setCancelling(orderId);
    setActionError(null);
    try {
      await brokerApi("cancel", { connectionId: c.id, orderId });
      await load();
      onChanged();
    } catch (e) {
      setActionError(errorText(e));
    } finally {
      setCancelling(null);
    }
  };

  const acc = accounts.data?.[0] ?? null;
  return (
    <Modal
      open
      onClose={onClose}
      width="max-w-5xl"
      title={
        <span className="flex flex-wrap items-center gap-2">
          {provider.name} <Pill color={c.environment === "real" ? "orange" : "blue"}>{c.environment === "real" ? "Real" : "Demo"}</Pill>
        </span>
      }
      subtitle={`${c.accountLabel ?? "Cuenta"} · datos en el formato común del módulo, leídos ahora del bróker`}
      footer={
        <button type="button" className={ghost} disabled={loading} onClick={() => void load()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Actualizar
        </button>
      }
    >
      <div className="space-y-6 text-sm">
        {actionError && <ErrorNote>{actionError}</ErrorNote>}

        {can("accounts") && (
          <section>
            {accounts.error && <ErrorNote>{accounts.error}</ErrorNote>}
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["Valor total", acc?.totalValue],
                ["Disponible para operar", acc?.cashAvailable],
                ["Invertido", acc?.investedValue],
              ].map(([label, v]) => (
                <div key={label as string} className="rounded-xl bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
                  <div className="mt-1 text-xl font-bold tracking-tight tabular-nums text-slate-900">{accounts.data ? money(v as number | null, acc?.currency) : "…"}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {can("positions") && (
          <Block title="Posiciones" error={positions.error} empty={positions.data?.length === 0 ? "Sin posiciones." : null} loading={!positions.data && !positions.error}>
            <table className="w-full min-w-[640px]">
              <thead className="border-b border-slate-100">
                <tr>
                  <th className={th}>Valor</th>
                  <th className={`${th} text-right`}>Cantidad</th>
                  <th className={`${th} text-right`}>Libre</th>
                  <th className={`${th} text-right`}>Precio medio</th>
                  <th className={`${th} text-right`}>Actual</th>
                  <th className={`${th} text-right`}>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {positions.data?.map((p) => {
                  const pnl = p.currentPrice !== null && p.averagePrice !== null ? (p.currentPrice - p.averagePrice) * p.quantity : null;
                  return (
                    <tr key={p.providerSymbol} className="border-b border-slate-100/80">
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-2.5">
                          <AssetIcon symbol={p.symbol} name={p.name ?? p.providerSymbol} size="sm" />
                          <span>
                            <span className="block font-medium text-slate-900">{p.name ?? p.providerSymbol}</span>
                            <span className="block text-xs text-slate-500">
                              {p.symbol ?? "sin par en euros"} · {p.providerSymbol}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{int(p.quantity)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{p.quantityAvailable === null ? "—" : int(p.quantityAvailable)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{money(p.averagePrice, p.currency)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{money(p.currentPrice, p.currency)}</td>
                      <td className={`px-3 py-2.5 text-right font-medium tabular-nums ${pnl === null ? "" : pnl >= 0 ? "text-emerald-700" : "text-red-700"}`}>{money(pnl, p.currency)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Block>
        )}

        {can("orders") && (
          <Block title="Órdenes abiertas" error={orders.error} empty={orders.data?.length === 0 ? "Sin órdenes abiertas." : null} loading={!orders.data && !orders.error}>
            <table className="w-full min-w-[640px]">
              <thead className="border-b border-slate-100">
                <tr>
                  <th className={th}>Orden</th>
                  <th className={th}>Tipo</th>
                  <th className={`${th} text-right`}>Cantidad</th>
                  <th className={`${th} text-right`}>Precio</th>
                  <th className={th}>Estado</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody>
                {orders.data?.map((o) => (
                  <tr key={o.orderId} className="border-b border-slate-100/80">
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-2.5">
                        <AssetIcon symbol={o.symbol} name={o.providerSymbol} size="sm" />
                        <span>
                          <b className={`font-semibold ${o.side === "buy" ? "text-emerald-700" : "text-red-700"}`}>{o.side === "buy" ? "Compra" : "Venta"}</b> {o.symbol ?? o.providerSymbol}
                          <span className="block text-xs text-slate-500">
                            #{o.orderId}
                            {o.createdByApi === false ? " · creada fuera de CRS" : ""}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{ORDER_TYPE[o.type] ?? o.type}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{int(o.quantity)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{o.limitPrice ?? o.stopPrice ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <Pill>{STATUS[o.status] ?? o.status}</Pill>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {can("cancel_order") && canTrade && o.createdByApi !== false && (
                        <button type="button" className={`${ghost} px-3 py-1.5 text-red-700`} disabled={!!cancelling} onClick={() => void cancel(o.orderId)}>
                          {cancelling === o.orderId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />} Cancelar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Block>
        )}

        {can("executions") && (
          <Block title="Últimas operaciones ejecutadas" error={executions.error} empty={executions.data?.length === 0 ? "Sin operaciones recientes." : null} loading={!executions.data && !executions.error}>
            <ul className="divide-y divide-slate-100/80">
              {executions.data?.map((x) => (
                <li key={x.executionId} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="flex items-center gap-2.5">
                    <AssetIcon symbol={x.symbol} name={x.providerSymbol} size="xs" />
                    <span>
                      <b className={`font-semibold ${x.side === "buy" ? "text-emerald-700" : "text-red-700"}`}>{x.side === "buy" ? "Compra" : "Venta"}</b> {int(x.quantity)} {x.symbol ?? x.providerSymbol}
                    </span>
                  </span>
                  <span className="tabular-nums text-slate-600">
                    {money(x.price, x.currency)} · {x.executedAt ? new Date(x.executedAt).toLocaleString("es-ES") : ""}
                  </span>
                </li>
              ))}
            </ul>
          </Block>
        )}

        {can("place_order") && (
          <TestOrder
            c={c}
            provider={provider}
            canTrade={canTrade}
            onSent={async () => {
              await load();
              onChanged();
            }}
          />
        )}
      </div>
    </Modal>
  );
}

function Block({ title, error, empty, loading, children }: { title: string; error: string | null; empty: string | null; loading: boolean; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[15px] font-semibold text-slate-900">{title}</h3>
      {error ? (
        <ErrorNote>{error}</ErrorNote>
      ) : loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
      ) : empty ? (
        <p className="text-slate-500">{empty}</p>
      ) : (
        <div className="overflow-x-auto">{children}</div>
      )}
    </section>
  );
}

/** Orden de prueba: pasa por el módulo central como cualquier otra (permisos, entorno, idempotencia, registro). */
function TestOrder({ c, provider, canTrade, onSent }: { c: ConnectionView; provider: ProviderView; canTrade: boolean; onSent: () => void | Promise<void> }) {
  const [symbol, setSymbol] = useState(provider.markets.includes("bolsa") ? "IBE.MC" : "BTC-EUR");
  const [side, setSide] = useState<OrderSide>("buy");
  const [type, setType] = useState<OrderType>("market");
  const [quantity, setQuantity] = useState("1");
  const [limit, setLimit] = useState("");
  const [stop, setStop] = useState("");
  const [confirmEnv, setConfirmEnv] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PlaceOrderResult | null>(null);
  // Una clave por intento: si la petición se corta y se repite, el módulo no envía dos órdenes.
  const key = useRef(newKey());

  const needsLimit = type === "limit" || type === "stop_limit";
  const needsStop = type === "stop" || type === "stop_limit";
  const num = (v: string) => Number(v.replace(",", "."));
  const valid = /^[A-Z0-9.^-]{2,20}$/i.test(symbol.trim()) && num(quantity) > 0 && (!needsLimit || num(limit) > 0) && (!needsStop || num(stop) > 0) && confirmEnv;

  const send = async () => {
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const r = await brokerApi<PlaceOrderResult>("order", {
        connectionId: c.id,
        environment: c.environment,
        confirmEnvironment: confirmEnv ? c.environment : null,
        symbol: symbol.trim().toUpperCase(),
        market: /-EUR$/i.test(symbol.trim()) ? "crypto" : "bolsa",
        side,
        type,
        quantity: num(quantity),
        limitPrice: needsLimit ? num(limit) : null,
        stopPrice: needsStop ? num(stop) : null,
        idempotencyKey: key.current,
      });
      setResult(r);
      key.current = newKey();
      setConfirmEnv(false);
      await onSent();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
      <h3 className="text-[15px] font-semibold text-slate-900">Orden de prueba</h3>
      <p className="mt-0.5 text-xs text-slate-500">
        Pasa por el módulo central como cualquier orden: comprueba permisos y entorno, resuelve el símbolo con {provider.name} y queda en el registro.
      </p>
      {!canTrade ? (
        <p className="mt-3 text-slate-600">Para enviar órdenes, activa el permiso «Operar» en esta conexión.</p>
      ) : (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-6">
            <label className="sm:col-span-2">
              <span className="text-xs font-medium text-slate-600">Valor (símbolo de CRS)</span>
              <input className={`${field} mt-1 w-full uppercase`} value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder={provider.markets.includes("bolsa") ? "IBE.MC" : "BTC-EUR"} />
            </label>
            <label>
              <span className="text-xs font-medium text-slate-600">Sentido</span>
              <select className={`${field} mt-1 w-full`} value={side} onChange={(e) => setSide(e.target.value as OrderSide)}>
                <option value="buy">Compra</option>
                <option value="sell">Venta</option>
              </select>
            </label>
            <label>
              <span className="text-xs font-medium text-slate-600">Tipo</span>
              <select className={`${field} mt-1 w-full`} value={type} onChange={(e) => setType(e.target.value as OrderType)}>
                {provider.orderTypes.map((t) => (
                  <option key={t} value={t}>
                    {ORDER_TYPE[t] ?? t}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="text-xs font-medium text-slate-600">Cantidad</span>
              <input className={`${field} mt-1 w-full tabular-nums`} inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </label>
            {needsLimit && (
              <label>
                <span className="text-xs font-medium text-slate-600">Precio límite</span>
                <input className={`${field} mt-1 w-full tabular-nums`} inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} />
              </label>
            )}
            {needsStop && (
              <label>
                <span className="text-xs font-medium text-slate-600">Precio stop</span>
                <input className={`${field} mt-1 w-full tabular-nums`} inputMode="decimal" value={stop} onChange={(e) => setStop(e.target.value)} />
              </label>
            )}
          </div>
          <label className="mt-3 flex items-start gap-2">
            <input type="checkbox" className="mt-1" checked={confirmEnv} onChange={(e) => setConfirmEnv(e.target.checked)} />
            <span>
              Confirmo que es una orden en la cuenta <b>{c.environment === "real" ? "REAL, con dinero de verdad" : "Demo (dinero ficticio)"}</b>.
            </span>
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" className={primary} disabled={!valid || sending} onClick={() => void send()}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar orden
            </button>
            {result && (
              <span className="text-slate-700">
                {result.duplicate ? "Ya estaba enviada (misma clave): no se ha repetido. " : "Enviada. "}
                Orden {result.orderId ?? "—"} · {STATUS[result.status] ?? result.status}
              </span>
            )}
          </div>
          {error && (
            <div className="mt-3">
              <ErrorNote>{error}</ErrorNote>
            </div>
          )}
        </>
      )}
    </section>
  );
}
