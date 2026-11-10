"use client";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Bot, LineChart, Loader2, Pencil, RotateCcw, X } from "lucide-react";
import type { accountDetail, PositionView } from "@/lib/trading/accounts";
import type { Trading212ConditionalKind, Trading212DemoOrder, Trading212DemoPosition, Trading212DemoSummary } from "@/lib/trading/trading212";
import { PATTERN_LIBRARY } from "@/lib/trading/library";
import { refreshTrading, useTradingRefresh } from "./navigation";
import { Modal } from "./ui";
import { BrokerPanel } from "./broker-panel";
import { PATTERN_SHORT, api, dayFmt, errorText, eur, eur0, field, ghost, int, num, panel, pct, primary, th, tone } from "./format";

type Detail = Awaited<ReturnType<typeof accountDetail>>;
type Instruments = {
  items: { symbol: string; name: string; sector: string | null; isIndex: boolean; active: boolean; lastCandle: string | null; lastError: string | null }[];
  canManage: boolean;
};

const STATUS_TONE: Record<string, string> = {
  pendiente: "bg-amber-50 text-amber-800 border-amber-200",
  abierta: "bg-blue-50 text-blue-700 border-blue-200",
  cerrada: "bg-slate-50 text-slate-700 border-slate-200",
  cancelada: "bg-slate-50 text-slate-400 border-slate-200",
};

function EquityCurve({ points, initial }: { points: { day: string; equity: number }[]; initial: number }) {
  if (points.length < 2)
    return (
      <p className="px-4 py-6 text-sm text-slate-500">
        La curva de patrimonio se dibuja con el cierre de cada sesión a partir de que la cartera tenga actividad.
      </p>
    );
  const w = 800;
  const h = 180;
  const vals = points.map((p) => p.equity).concat(initial);
  const lo = Math.min(...vals) * 0.995;
  const hi = Math.max(...vals) * 1.005;
  const x = (i: number) => 40 + (i / (points.length - 1)) * (w - 50);
  const y = (v: number) => 10 + ((hi - v) / (hi - lo)) * (h - 30);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.equity).toFixed(1)}`).join("");
  const last = points[points.length - 1].equity;
  const col = last >= initial ? "#059669" : "#dc2626";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="block h-[180px] w-full" preserveAspectRatio="none">
      <line x1={40} x2={w - 10} y1={y(initial)} y2={y(initial)} stroke="#cbd5e1" strokeDasharray="4 4" />
      <text x={36} y={y(initial) + 3} fontSize="10" fill="#94a3b8" textAnchor="end">
        {int(Math.round(initial))}
      </text>
      <path d={`${d}L${x(points.length - 1)},${h - 20}L${x(0)},${h - 20}Z`} fill={col} fillOpacity={0.06} />
      <path d={d} fill="none" stroke={col} strokeWidth={1.8} vectorEffect="non-scaling-stroke" />
      <text x={40} y={h - 4} fontSize="10" fill="#94a3b8">
        {dayFmt(points[0].day)}
      </text>
      <text x={w - 10} y={h - 4} fontSize="10" fill="#94a3b8" textAnchor="end">
        {dayFmt(points[points.length - 1].day)}
      </text>
    </svg>
  );
}

type PortfolioSource = "crs" | "trading212";

export function PortfolioPanel({ onOpenChart }: { onOpenChart: (symbol: string) => void }) {
  const params = useSearchParams();
  const [source, setSource] = useState<PortfolioSource>(params.get("source") === "trading212" ? "trading212" : "crs");
  // Las credenciales pertenecen por ahora a una única cuenta personal de Demo en localhost.
  const demoAvailable = process.env.NODE_ENV === "development";

  if (!demoAvailable) return <CrsPortfolioPanel onOpenChart={onOpenChart} />;

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Seleccionar cartera" className="flex gap-1 border-b border-slate-200">
        {([
          ["crs", "Simulador CRS"],
          ["trading212", "Trading 212 Demo"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`portfolio-tab-${key}`}
            aria-controls={`portfolio-panel-${key}`}
            aria-selected={source === key}
            onClick={() => setSource(key)}
            className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              source === key
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`portfolio-panel-${source}`} aria-labelledby={`portfolio-tab-${source}`}>
        {source === "crs" ? <CrsPortfolioPanel onOpenChart={onOpenChart} /> : <Trading212DemoPortfolio />}
      </div>
    </div>
  );
}

function Trading212DemoPortfolio() {
  const [summary, setSummary] = useState<Trading212DemoSummary | null>(null);
  const [positions, setPositions] = useState<Trading212DemoPosition[] | null>(null);
  const [orders, setOrders] = useState<Trading212DemoOrder[]>([]);
  const [conditional, setConditional] = useState<{ kind: Trading212ConditionalKind; ticker: string; name: string; quantity: number; lastPrice: number | null } | null>(null);
  const [conditionalPrice, setConditionalPrice] = useState("");
  const [conditionalQuantity, setConditionalQuantity] = useState("1");
  const [conditionalAccepted, setConditionalAccepted] = useState(false);
  const [conditionalBusy, setConditionalBusy] = useState(false);
  const [cancelOrder, setCancelOrder] = useState<Trading212DemoOrder | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [orderResult, setOrderResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmBuy, setConfirmBuy] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [buying, setBuying] = useState(false);
  const [buyResult, setBuyResult] = useState<string | null>(null);
  const [sellPosition, setSellPosition] = useState<Trading212DemoPosition | null>(null);
  const [sellAcknowledged, setSellAcknowledged] = useState(false);
  const [selling, setSelling] = useState(false);
  const [sellResult, setSellResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [account, portfolio, pending] = await Promise.all([
        api<Trading212DemoSummary>("trading212/account"),
        api<{ environment: "demo"; items: Trading212DemoPosition[] }>("trading212/positions"),
        api<{ environment: "demo"; items: Trading212DemoOrder[] }>("trading212/orders"),
      ]);
      setSummary(account);
      setPositions(portfolio.items);
      setOrders(pending.items);
      setError(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useTradingRefresh(load);

  const buyTest = async () => {
    if (!acknowledged || buying) return;
    setBuying(true);
    setError(null);
    try {
      const result = await api<{ orderId: number; status: string }>("trading212/buy-test", {
        symbol: "IBE.MC",
        quantity: 1,
        confirmDemo: true,
      });
      setConfirmBuy(false);
      setAcknowledged(false);
      setBuyResult(`Orden Demo enviada (ID ${result.orderId}; estado: ${result.status}). Puede estar pendiente hasta la apertura de mercado. No se han configurado stops.`);
      await load();
    } catch (e) {
      setError(`${errorText(e)}. Si llegaste a confirmar, comprueba las órdenes en Trading 212 antes de volver a intentarlo.`);
      setConfirmBuy(false);
      setAcknowledged(false);
    } finally {
      setBuying(false);
    }
  };

  const sellPositionNow = async () => {
    const p = sellPosition;
    const available = p?.quantityAvailableForTrading;
    if (!sellAcknowledged || selling || !p?.ticker || available === null || available === undefined || available <= 0) return;
    setSelling(true);
    setError(null);
    try {
      const result = await api<{ orderId: number; status: string; quantity: number }>("trading212/sell", {
        ticker: p.ticker,
        quantity: available,
        confirmDemo: true,
      });
      setSellPosition(null);
      setSellAcknowledged(false);
      setSellResult(`Venta de ${int(result.quantity)} acciones enviada a Trading 212 Demo (orden ${result.orderId}; estado: ${result.status}). Puede quedar pendiente hasta que abra el mercado.`);
      void load();
    } catch (e) {
      setError(`${errorText(e)}. Si confirmaste la venta, comprueba su estado en Trading 212 antes de volver a enviarla.`);
      setSellPosition(null);
      setSellAcknowledged(false);
    } finally {
      setSelling(false);
    }
  };

  const openConditional = (kind: Trading212ConditionalKind, position?: Trading212DemoPosition) => {
    const isBuy = kind.startsWith("buy");
    setConditional({
      kind,
      ticker: isBuy ? "IBEe_EQ" : (position?.ticker ?? ""),
      name: isBuy ? "Iberdrola" : (position?.name ?? position?.ticker ?? ""),
      quantity: isBuy ? 1 : (position?.quantityAvailableForTrading ?? 0),
      lastPrice: position?.currentPrice ?? null,
    });
    setConditionalPrice("");
    setConditionalQuantity(isBuy ? "1" : String(position?.quantityAvailableForTrading ?? 0));
    setConditionalAccepted(false);
    setError(null);
  };

  const submitConditional = async () => {
    if (!conditional || !conditionalAccepted || conditionalBusy) return;
    const price = Number(conditionalPrice.replace(",", "."));
    const quantity = Number(conditionalQuantity.replace(",", "."));
    if (!(price > 0) || !(quantity > 0)) {
      setError("Introduce precio y cantidad válidos");
      return;
    }
    setConditionalBusy(true);
    setError(null);
    try {
      const result = await api<{ orderId: number; status: string }>("trading212/conditional", {
        kind: conditional.kind, ticker: conditional.ticker, quantity, price, confirmDemo: true,
      });
      setOrderResult(`Orden condicionada Demo registrada (ID ${result.orderId}; estado: ${result.status}). Puedes consultarla y cancelarla en «Órdenes pendientes».`);
      setConditional(null);
      await load();
    } catch (e) {
      setError(`${errorText(e)}. Antes de reintentar, comprueba las órdenes pendientes de Trading 212.`);
    } finally {
      setConditionalBusy(false);
    }
  };

  const cancelPending = async () => {
    if (!cancelOrder || cancelBusy) return;
    setCancelBusy(true);
    setError(null);
    try {
      await api("trading212/cancel-order", { id: cancelOrder.id, confirmDemo: true });
      setOrderResult(`Cancelación solicitada para la orden ${cancelOrder.id}. Comprueba el estado actualizado.`);
      setCancelOrder(null);
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setCancelBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Cuenta de práctica de Trading 212. Saldo y posiciones independientes del simulador CRS.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={ghost} onClick={() => { setAcknowledged(false); setConfirmBuy(true); }} disabled={buying || selling || loading || conditionalBusy || !summary || !!error}>
            Compra de prueba: 1 Iberdrola
          </button>
          <button type="button" className={ghost} onClick={() => openConditional("buy_limit")} disabled={loading || conditionalBusy || selling || buying || !summary || !!error}>
            Compra programada
          </button>
          <button type="button" className={ghost} onClick={() => void load()} disabled={loading || buying || selling}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            Actualizar
          </button>
        </div>
      </div>
      <BrokerPanel />
      {buyResult && <p role="status" className="border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{buyResult}</p>}
      {sellResult && <p role="status" className="border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{sellResult}</p>}
      {orderResult && <p role="status" className="border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{orderResult}</p>}
      {error && <p role="alert" className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {!summary && loading ? (
        <div className="flex h-40 items-center justify-center border border-slate-200 bg-white">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      ) : summary ? (
        <>
          <div className="grid gap-px border border-slate-200 bg-slate-200 sm:grid-cols-3">
            {([
              ["Patrimonio total", summary.totalValue],
              ["Disponible para operar", summary.availableToTrade],
              ["Invertido", summary.investedValue],
            ] as const).map(([label, value]) => (
              <div key={label} className="bg-white px-4 py-4">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
                <div className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
                  {summary.currency === "EUR" ? eur(value, 2) : `${num(value, 2)} ${summary.currency}`}
                </div>
              </div>
            ))}
          </div>

          <section className={`${panel} overflow-x-auto`}>
            <header className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">Posiciones en Trading 212 Demo</h2>
              <p className="text-xs text-slate-500">
                Datos obtenidos del bróker. Los precios se muestran en la divisa de cada instrumento; no se convierten a euros.
              </p>
            </header>
            <table className="w-full min-w-[750px] text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className={th}>Valor</th>
                  <th className={`${th} text-right`}>Cantidad</th>
                  <th className={`${th} text-right`}>Disponible</th>
                  <th className={`${th} text-right`}>Precio medio</th>
                  <th className={`${th} text-right`}>Precio actual</th>
                  <th className={`${th} text-right`}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {positions?.length ? positions.map((p, i) => (
                  <tr key={`${p.ticker ?? "position"}-${i}`} className="border-t border-slate-100">
                    <td className="px-3 py-3">
                      <div className="font-medium text-slate-900">{p.name ?? p.ticker ?? "Instrumento"}</div>
                      {p.ticker && <div className="text-xs text-slate-500">{p.ticker}</div>}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{int(p.quantity)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {p.quantityAvailableForTrading === null ? "—" : int(p.quantityAvailableForTrading)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{num(p.averagePricePaid, 2)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{num(p.currentPrice, 2)}</td>
                    <td className="px-3 py-3 text-right">
                      <button
                        type="button"
                        className={ghost}
                        disabled={loading || buying || selling || !p.ticker || !(p.quantityAvailableForTrading !== null && p.quantityAvailableForTrading > 0)}
                        onClick={() => { setSellAcknowledged(false); setSellPosition(p); }}
                        title={p.quantityAvailableForTrading === null || p.quantityAvailableForTrading <= 0
                          ? "No hay acciones disponibles para vender"
                          : "Vender las acciones disponibles"}
                      >
                        Vender
                      </button>
                      <button
                        type="button"
                        className={`${ghost} ml-1`}
                        disabled={loading || buying || selling || conditionalBusy || !p.ticker ||
                          !(p.quantityAvailableForTrading !== null && p.quantityAvailableForTrading > 0) ||
                          orders.some(o => o.ticker === p.ticker && o.side === "SELL")}
                        onClick={() => openConditional("sell_stop", p)}
                      >
                        Stop
                      </button>
                      <button
                        type="button"
                        className={`${ghost} ml-1`}
                        disabled={loading || buying || selling || conditionalBusy || !p.ticker ||
                          !(p.quantityAvailableForTrading !== null && p.quantityAvailableForTrading > 0) ||
                          orders.some(o => o.ticker === p.ticker && o.side === "SELL")}
                        onClick={() => openConditional("sell_limit", p)}
                      >
                        Objetivo
                      </button>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Todavía no hay posiciones abiertas en Trading 212 Demo.</td></tr>
                )}
              </tbody>
            </table>
          </section>
          <section className={`${panel} overflow-x-auto`}>
            <header className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">Órdenes pendientes en Trading 212 Demo</h2>
              <p className="text-xs text-slate-500">
                Stop y objetivo son órdenes alternativas: Trading 212 no ofrece aquí una vinculación OCO.
                Cancela una antes de crear la otra sobre las mismas acciones.
              </p>
            </header>
            <table className="w-full min-w-[750px] text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className={th}>Instrumento</th>
                  <th className={th}>Tipo</th>
                  <th className={`${th} text-right`}>Cantidad</th>
                  <th className={`${th} text-right`}>Precio de activación</th>
                  <th className={th}>Estado</th>
                  <th className={`${th} text-right`}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {orders.length ? orders.map(o => (
                  <tr key={o.id} className="border-t border-slate-100">
                    <td className="px-3 py-3 font-medium text-slate-900">{o.ticker}</td>
                    <td className="px-3 py-3">{o.side === "BUY" ? "Compra" : "Venta"} · {o.type}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{int(Math.abs(o.quantity))}</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {o.type === "STOP" ? num(o.stopPrice, 3) : o.type === "LIMIT" ? num(o.limitPrice, 3) : "—"}
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-600">{o.status}</td>
                    <td className="px-3 py-3 text-right">
                      <button type="button" className={ghost}
                        disabled={cancelBusy || conditionalBusy || o.initiatedFrom !== "API"}
                        onClick={() => setCancelOrder(o)}>
                        Cancelar
                      </button>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">No hay órdenes pendientes.</td></tr>
                )}
              </tbody>
            </table>
          </section>
          <p className="text-xs text-slate-500">
            Las compras, stops y objetivos condicionados se ejecutan en Trading 212 Demo al alcanzar el precio indicado,
            incluso con CRS cerrado. El stop no garantiza un precio mínimo de venta.
          </p>
        </>
      ) : null}
      {conditional && (
        <Modal
          open
          onClose={() => { if (!conditionalBusy) setConditional(null); }}
          title={conditional.kind.startsWith("buy") ? "Programar compra · Trading 212 Demo" :
            conditional.kind === "sell_stop" ? "Stop de protección · Trading 212 Demo" : "Objetivo de beneficio · Trading 212 Demo"}
          subtitle="Orden condicionada en el bróker · sin dinero real"
          footer={
            <>
              <button type="button" className={ghost} disabled={conditionalBusy} onClick={() => setConditional(null)}>
                Cancelar
              </button>
              <button type="button" className={primary} disabled={conditionalBusy || !conditionalAccepted}
                onClick={() => void submitConditional()}>
                {conditionalBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                Registrar orden Demo
              </button>
            </>
          }
        >
          <div className="space-y-4 text-sm text-slate-700">
            <p><b>{conditional.name}</b> · {conditional.ticker}</p>
            {conditional.kind.startsWith("buy") && (
              <fieldset className="space-y-2 border border-slate-200 px-3 py-2">
                <legend className="text-xs font-medium">Tipo de compra automática al precio</legend>
                <label className="flex items-center gap-2">
                  <input type="radio" checked={conditional.kind === "buy_limit"} onChange={() => setConditional({ ...conditional, kind: "buy_limit" })} />
                  Límite: comprar a este precio o más barato
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" checked={conditional.kind === "buy_stop"} onChange={() => setConditional({ ...conditional, kind: "buy_stop" })} />
                  Stop de compra: activar compra al alcanzar el precio por arriba
                </label>
              </fieldset>
            )}
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs">
                <span className="mb-1 block font-medium text-slate-700">Cantidad de acciones</span>
                <input type="number" min="0.000001" step="any" className={`${field} w-full`}
                  value={conditionalQuantity} disabled={!conditional.kind.startsWith("buy") || conditionalBusy}
                  onChange={(e) => setConditionalQuantity(e.target.value)} />
              </label>
              <label className="text-xs">
                <span className="mb-1 block font-medium text-slate-700">
                  {conditional.kind.endsWith("stop") ? "Precio de activación (€)" : "Precio límite (€)"}
                </span>
                <input type="number" min="0.0001" step="any" className={`${field} w-full`}
                  value={conditionalPrice} disabled={conditionalBusy}
                  onChange={(e) => setConditionalPrice(e.target.value)} />
              </label>
            </div>
            {conditional.lastPrice !== null && (
              <p className="text-xs text-slate-500">Último precio comunicado por Trading 212: {num(conditional.lastPrice, 3)} €.</p>
            )}
            <p className="border border-amber-200 bg-amber-50 p-3 text-amber-900">
              Las órdenes se almacenan y ejecutan en el bróker, aunque cierres CRS.
              Un límite de compra por encima del precio de mercado puede ejecutarse inmediatamente.
              Las compras programadas no colocan stops después de ejecutarse.
              No se vincula automáticamente un stop con un objetivo: solo puede reservarse esta cantidad para una de las dos órdenes.
              No se garantizan precios de ejecución para los stops.
            </p>
            {error && <p role="alert" className="text-red-700">{error}</p>}
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-1" checked={conditionalAccepted} disabled={conditionalBusy}
                onChange={(e) => setConditionalAccepted(e.target.checked)} />
              <span>Confirmo esta orden automática con dinero ficticio en Trading 212 Demo.</span>
            </label>
          </div>
        </Modal>
      )}
      {cancelOrder && (
        <Modal
          open
          onClose={() => { if (!cancelBusy) setCancelOrder(null); }}
          title="Cancelar orden · Trading 212 Demo"
          subtitle="Una orden puede haberse ejecutado antes de recibir la cancelación."
          footer={
            <>
              <button type="button" className={ghost} disabled={cancelBusy} onClick={() => setCancelOrder(null)}>Volver</button>
              <button type="button" className={primary} disabled={cancelBusy} onClick={() => void cancelPending()}>
                {cancelBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                Solicitar cancelación
              </button>
            </>
          }
        >
          <p className="text-sm text-slate-700">
            Vas a solicitar la cancelación de la orden <strong>#{cancelOrder.id}</strong> ({cancelOrder.side} · {cancelOrder.type}) de
            {" "}<strong>{cancelOrder.ticker}</strong> en Demo.
          </p>
        </Modal>
      )}
      {sellPosition && (
        <Modal
          open
          onClose={() => { if (!selling) setSellPosition(null); }}
          title={`Vender · ${sellPosition.name ?? sellPosition.ticker ?? "Posición"}`}
          subtitle="Trading 212 Demo · Sin dinero real"
          footer={
            <>
              <button type="button" className={ghost} disabled={selling} onClick={() => setSellPosition(null)}>
                Cancelar
              </button>
              <button type="button" className={primary} disabled={selling || !sellAcknowledged} onClick={() => void sellPositionNow()}>
                {selling && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirmar venta Demo
              </button>
            </>
          }
        >
          <div className="space-y-4 text-sm text-slate-700">
            <p>
              Se enviará a Trading 212 Demo una <strong>orden de mercado de venta</strong> por
              {" "}<strong>{int(sellPosition.quantityAvailableForTrading ?? 0)} acciones disponibles</strong> de
              {" "}<strong>{sellPosition.name ?? sellPosition.ticker}</strong>.
              El resto de tus inversiones en CRS no se modificará.
            </p>
            {sellPosition.quantityAvailableForTrading !== null && sellPosition.quantityAvailableForTrading < sellPosition.quantity && (
              <p className="text-amber-800">
                Parte de la posición no está disponible para operar. Se venderá solo la cantidad disponible.
              </p>
            )}
            <p className="border border-amber-200 bg-amber-50 p-3 text-amber-900">
              El precio final puede diferir del mostrado y la orden puede quedar pendiente si el mercado está cerrado.
              Si falla la solicitud, comprueba primero las órdenes en el bróker; no repitas la venta sin verificarla.
            </p>
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-1" checked={sellAcknowledged}
                disabled={selling}
                onChange={(e) => setSellAcknowledged(e.target.checked)} />
              <span>Confirmo que quiero vender esta cantidad ficticia desde mi cuenta Trading 212 Demo.</span>
            </label>
          </div>
        </Modal>
      )}
      {confirmBuy && (
        <Modal
          open
          onClose={() => { if (!buying) setConfirmBuy(false); }}
          title="Compra de prueba · Trading 212 Demo"
          subtitle="Una acción ficticia de Iberdrola. Sin dinero real."
          footer={
            <>
              <button type="button" className={ghost} onClick={() => setConfirmBuy(false)} disabled={buying}>
                Cancelar
              </button>
              <button type="button" className={primary} disabled={!acknowledged || buying} onClick={() => void buyTest()}>
                {buying && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirmar compra Demo
              </button>
            </>
          }
        >
          <div className="space-y-4 text-sm text-slate-700">
            <p>
              Se enviará una orden de <strong>mercado</strong> para comprar <strong>1 acción de Iberdrola</strong>
              {" "}(ticker Trading 212: <code>IBEe_EQ</code>) en tu cuenta <strong>Demo</strong>.
              No se modificará el simulador CRS.
            </p>
            <p className="border border-amber-200 bg-amber-50 p-3 text-amber-900">
              No incluye stop ni objetivo automáticos. El precio final puede variar y, si el mercado está cerrado,
              la orden puede quedar pendiente. No vuelvas a enviarla sin comprobar antes su estado.
            </p>
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-1" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
              <span>Entiendo que es una compra ficticia sin protección automática y quiero enviarla a Trading 212 Demo.</span>
            </label>
          </div>
        </Modal>
      )}
    </div>
  );
}

function CrsPortfolioPanel({ onOpenChart }: { onOpenChart: (symbol: string) => void }) {
  const onChanged = refreshTrading;
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<PositionView | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<Detail>("account"));
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useTradingRefresh(load);

  const act = async (id: string, path: string, body: unknown) => {
    setBusy(id);
    setError(null);
    try {
      await api(path, body);
      onChanged();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  if (!data)
    return error ? (
      <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
    ) : (
      <div className="flex h-40 items-center justify-center border border-slate-200 bg-white">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );

  const s = data.summary;
  const active = data.positions.filter((p) => p.status === "abierta" || p.status === "pendiente");
  const history = data.positions.filter((p) => p.status === "cerrada" || p.status === "cancelada");

  return (
    <div className="space-y-4">
      {error && <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="grid gap-px border border-slate-200 bg-slate-200 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Patrimonio", eur0(s.equity), pct(s.returnPct), tone(s.returnPct)],
          ["Invertido", eur0(s.invested), `${num(s.equity ? (s.invested / s.equity) * 100 : 0, 0)} % de la cartera`, "text-slate-500"],
          ["Resultado cerrado", eur0(s.realized), `${s.stats.closed} operaciones`, tone(s.realized)],
          ["Latente", eur0(s.unrealized), `${active.filter((p) => p.status === "abierta").length} abiertas`, tone(s.unrealized)],
          ["Acierto", s.stats.closed ? `${num(s.stats.winRate * 100, 0)} %` : "—", `R medio ${num(s.stats.avgR, 2)}`, tone(s.stats.avgR)],
          ["Factor de beneficio", s.stats.profitFactor ? num(s.stats.profitFactor, 2) : "—", `mejor ${eur0(s.stats.bestTrade)} · peor ${eur0(s.stats.worstTrade)}`, "text-slate-500"],
        ].map(([label, value, sub, cls]) => (
          <div key={label} className="bg-white px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{value}</div>
            <div className={`text-xs ${cls}`}>{sub}</div>
          </div>
        ))}
      </div>

      <section className={panel}>
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Evolución del patrimonio</h2>
          <span className="text-xs text-slate-500">Capital inicial {eur0(s.initialCapital)}</span>
        </header>
        <EquityCurve points={data.equity} initial={s.initialCapital} />
      </section>

      <section className={`${panel} overflow-x-auto`}>
        <header className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Posiciones abiertas y órdenes pendientes</h2>
          <p className="text-xs text-slate-500">
            Se revisan cada día al cierre: si el precio toca el stop o el objetivo, la posición se cierra sola
            {s.settings.breakeven ? "; al ganar 1 R el stop sube a precio de entrada" : ""}.
          </p>
        </header>
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className={th}>Valor</th>
              <th className={th}>Estado</th>
              <th className={`${th} text-right`}>Cantidad</th>
              <th className={`${th} text-right`}>Entrada</th>
              <th className={`${th} text-right`}>Actual</th>
              <th className={`${th} text-right`}>Stop</th>
              <th className={`${th} text-right`}>Objetivo</th>
              <th className={`${th} text-right`}>Latente</th>
              <th className={th}>Origen</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody>
            {active.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                  Sin posiciones. Abre una desde «Oportunidades» o activa el modo automático en «Reglas y riesgo».
                </td>
              </tr>
            ) : (
              active.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-3 py-2.5">
                    <button type="button" className="text-left" onClick={() => onOpenChart(p.symbol)}>
                      <div className="font-medium text-slate-900 hover:text-blue-700">{p.name}</div>
                      <div className="text-xs text-slate-500">
                        {p.symbol} · {p.direction === "long" ? "largo" : "corto"}
                        {p.pattern ? ` · ${PATTERN_SHORT[p.pattern]}` : ""}
                      </div>
                    </button>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`border px-1.5 py-0.5 text-xs ${STATUS_TONE[p.status]}`}>{p.status}</span>
                    {p.status === "pendiente" && <div className="mt-0.5 text-xs text-slate-500">próxima apertura</div>}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{int(p.quantity)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {eur(p.entryPrice ?? p.plannedEntry)}
                    <div className="text-xs text-slate-500">{p.entryDay ? dayFmt(p.entryDay) : "prevista"}</div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{eur(p.lastPrice)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-red-700">
                    {eur(p.stop)}
                    {p.stop !== p.initialStop && <div className="text-xs text-slate-500">inicial {eur(p.initialStop)}</div>}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700">{eur(p.target)}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${tone(p.unrealized)}`}>
                    {p.unrealized !== null ? eur0(p.unrealized) : "—"}
                    {p.unrealizedR !== null && <div className="text-xs">{num(p.unrealizedR, 2)} R</div>}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-600">
                    {p.source === "auto" ? (
                      <span className="inline-flex items-center gap-1">
                        <Bot className="h-3.5 w-3.5" /> automático
                      </span>
                    ) : p.source === "comite" ? (
                      "comité de inversión"
                    ) : (
                      "manual"
                    )}
                    {p.score !== null && <div>puntuación {p.score}</div>}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex justify-end gap-1">
                      <button type="button" title="Ver gráfico" className="p-1.5 text-slate-500 hover:bg-slate-100" onClick={() => onOpenChart(p.symbol)}>
                        <LineChart className="h-4 w-4" />
                      </button>
                      <button type="button" title="Cambiar stop y objetivo" className="p-1.5 text-slate-500 hover:bg-slate-100" onClick={() => setEditing(p)}>
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className={ghost}
                        disabled={busy === p.id}
                        onClick={() => act(p.id, "close", { positionId: p.id })}
                      >
                        {busy === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                        {p.status === "pendiente" ? "Cancelar" : "Cerrar"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section className={`${panel} overflow-x-auto`}>
        <header className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Historial de operaciones</h2>
        </header>
        <table className="w-full min-w-[880px] text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className={th}>Valor</th>
              <th className={th}>Figura</th>
              <th className={th}>Entrada</th>
              <th className={th}>Salida</th>
              <th className={th}>Motivo</th>
              <th className={`${th} text-right`}>Cantidad</th>
              <th className={`${th} text-right`}>Resultado</th>
              <th className={`${th} text-right`}>R</th>
            </tr>
          </thead>
          <tbody>
            {history.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  Aún no hay operaciones cerradas.
                </td>
              </tr>
            ) : (
              history.map((p) => (
                <tr key={p.id} className={`border-t border-slate-100 ${p.status === "cancelada" ? "text-slate-400" : ""}`}>
                  <td className="px-3 py-2">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-slate-500">{p.direction === "long" ? "largo" : "corto"}</div>
                  </td>
                  <td className="px-3 py-2">{p.pattern ? PATTERN_SHORT[p.pattern] : "manual"}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {p.entryPrice !== null ? `${eur(p.entryPrice)} · ${dayFmt(p.entryDay)}` : "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{p.exitPrice !== null ? `${eur(p.exitPrice)} · ${dayFmt(p.exitDay)}` : "—"}</td>
                  <td className="px-3 py-2 text-xs">{p.status === "cancelada" ? `Cancelada: ${p.exitReason ?? ""}` : p.exitReason}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{int(p.quantity)}</td>
                  <td className={`px-3 py-2 text-right font-medium tabular-nums ${tone(p.pnl)}`}>{p.pnl !== null ? eur0(p.pnl) : "—"}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${tone(p.rMultiple)}`}>{p.rMultiple !== null ? num(p.rMultiple, 2) : "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section className={panel}>
        <header className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Movimientos de caja</h2>
        </header>
        <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto text-sm">
          {data.transactions.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-4 px-4 py-2">
              <span className="text-slate-700">
                <span className="mr-2 text-xs text-slate-500">{dayFmt(t.day)}</span>
                {t.description}
              </span>
              <span className={`shrink-0 tabular-nums ${tone(t.amount)}`}>{eur(t.amount, 2)}</span>
            </li>
          ))}
        </ul>
      </section>

      {editing && (
        <EditStops
          position={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function EditStops({ position, onClose, onSaved }: { position: PositionView; onClose: () => void; onSaved: () => void }) {
  const [stop, setStop] = useState(position.stop.toFixed(3));
  const [target, setTarget] = useState(position.target.toFixed(3));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await api("stops", { positionId: position.id, stop: Number(stop.replace(",", ".")), target: Number(target.replace(",", ".")) });
      onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm border border-slate-200 bg-white shadow-xl">
        <div className="border-b border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900">
          Stop y objetivo · {position.name}
        </div>
        <div className="grid grid-cols-2 gap-3 px-5 py-4">
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-red-700">Stop</span>
            <input className={`${field} w-full`} value={stop} onChange={(e) => setStop(e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-emerald-700">Objetivo</span>
            <input className={`${field} w-full`} value={target} onChange={(e) => setTarget(e.target.value)} />
          </label>
        </div>
        {error && <p className="mx-5 mb-3 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button type="button" className={ghost} onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className={primary} onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

function Settings({ summary, onSaved }: { summary: Detail["summary"]; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState(summary.settings);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [capital, setCapital] = useState(String(Math.round(summary.initialCapital)));
  const [confirmReset, setConfirmReset] = useState(false);
  useEffect(() => setForm(summary.settings), [summary.settings]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await api("settings", form);
      await onSaved();
      setMsg("Ajustes guardados");
    } catch (e) {
      setMsg(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  const reset = async () => {
    setSaving(true);
    try {
      await api("reset", { confirm: true, capital: Number(capital) });
      setConfirmReset(false);
      await onSaved();
      setMsg("Cartera reiniciada");
    } catch (e) {
      setMsg(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  const numInput = (k: "riskPerTradePct" | "maxPositionPct" | "maxOpenPositions" | "commissionPct" | "commissionMin" | "slippageBps" | "minScore", label: string, hint: string, step = "0.1") => (
    <label className="text-sm">
      <span className="mb-1 block text-xs font-medium text-slate-700">{label}</span>
      <input type="number" step={step} className={`${field} w-full tabular-nums`} value={form[k]} onChange={(e) => set(k, Number(e.target.value))} />
      <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>
    </label>
  );

  return (
    <section className={panel}>
      <header className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Reglas de la cartera</h2>
        <p className="text-xs text-slate-500">Deciden el tamaño de cada operación, qué señales cuentan y si el sistema opera solo.</p>
      </header>
      <div className="grid gap-4 px-4 py-4 sm:grid-cols-2 lg:grid-cols-4">
        {numInput("riskPerTradePct", "Riesgo por operación (%)", "Lo que pierdes si salta el stop. Lo habitual: 0,5 – 2 %.")}
        {numInput("maxPositionPct", "Tamaño máximo por posición (%)", "Tope de la cartera en un solo valor.", "1")}
        {numInput("maxOpenPositions", "Posiciones abiertas máximas", "Diversificación mínima.", "1")}
        {numInput("minScore", "Puntuación mínima (0-100)", "Por debajo, las señales se muestran pero no se recomiendan.", "1")}
        {numInput("commissionPct", "Comisión (%)", "Por operación, sobre el importe.", "0.01")}
        {numInput("commissionMin", "Comisión mínima (€)", "Por operación.", "0.5")}
        {numInput("slippageBps", "Deslizamiento (pb)", "Diferencia frente al precio teórico. 5 pb = 0,05 %.", "1")}
        <div className="space-y-2 text-sm">
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" checked={form.breakeven} onChange={(e) => set("breakeven", e.target.checked)} />
            <span>
              Stop a break-even
              <span className="block text-xs text-slate-500">Al ganar 1 R, el stop sube a la entrada.</span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" checked={form.allowShort} onChange={(e) => set("allowShort", e.target.checked)} />
            <span>
              Permitir cortos
              <span className="block text-xs text-slate-500">Si no, las señales bajistas se tratan como «evitar / vender».</span>
            </span>
          </label>
        </div>
      </div>
      <div className="border-t border-slate-100 px-4 py-4">
        <div className="mb-2 text-xs font-medium text-slate-700">Figuras que se operan (ninguna marcada = todas)</div>
        <div className="flex flex-wrap gap-2">
          {PATTERN_LIBRARY.map((p) => {
            const on = form.patterns.includes(p.key);
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => set("patterns", on ? form.patterns.filter((x) => x !== p.key) : [...form.patterns, p.key])}
                className={`border px-2.5 py-1 text-xs ${on ? "border-blue-300 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
              >
                {p.name}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 bg-slate-50/60 px-4 py-4">
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1" checked={form.autoTrade} onChange={(e) => set("autoTrade", e.target.checked)} />
          <span>
            <b className="inline-flex items-center gap-1 font-semibold text-slate-900">
              <Bot className="h-4 w-4" /> Modo automático
            </b>
            <span className="block max-w-xl text-xs text-slate-600">
              Cada día al cierre, el sistema programa órdenes para la próxima apertura con las señales que superen tu puntuación
              mínima, respetando tus límites. Las cierra solo en stop, objetivo o por tiempo.
            </span>
          </span>
        </label>
        <div className="ml-auto flex items-center gap-3">
          {msg && <span className="text-sm text-slate-600">{msg}</span>}
          <button type="button" className={primary} onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Guardar reglas
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 px-4 py-3 text-sm">
        <RotateCcw className="h-4 w-4 text-slate-500" />
        <span className="text-slate-700">Reiniciar la cartera con</span>
        <input className={`${field} w-32 tabular-nums`} value={capital} onChange={(e) => setCapital(e.target.value)} inputMode="numeric" />
        <span className="text-slate-700">€</span>
        {confirmReset ? (
          <>
            <span className="text-red-700">Se borran todas las posiciones y el historial.</span>
            <button type="button" className="inline-flex items-center gap-1.5 bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700" onClick={reset} disabled={saving}>
              Sí, reiniciar
            </button>
            <button type="button" className={ghost} onClick={() => setConfirmReset(false)}>
              No
            </button>
          </>
        ) : (
          <button type="button" className={ghost} onClick={() => setConfirmReset(true)}>
            Reiniciar
          </button>
        )}
      </div>
    </section>
  );
}

export function UniversePanel() {
  const onChanged = refreshTrading;
  const [data, setData] = useState<Instruments | null>(null);
  const [symbol, setSymbol] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api<Instruments>("instruments").then(setData).catch((e) => setMsg(errorText(e))), []);
  useEffect(() => {
    void load();
  }, [load]);
  const run = async (body: unknown, ok: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await api("instruments", body);
      setMsg(ok);
      await load();
      onChanged();
    } catch (e) {
      setMsg(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  if (!data) return null;
  const canManage = data.canManage;
  return (
    <section className={panel}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Valores que se siguen</h2>
          <p className="text-xs text-slate-500">
            {data.items.filter((i) => i.active).length} activos. Símbolos de Yahoo Finance: «.MC» para la Bolsa de Madrid (p. ej. CIE.MC).
          </p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <input className={`${field} w-36`} placeholder="Símbolo" value={symbol} onChange={(e) => setSymbol(e.target.value)} />
            <button type="button" className={ghost} disabled={busy || !symbol.trim()} onClick={() => run({ op: "add", symbol }, `${symbol.toUpperCase()} añadido; se descargará en la próxima actualización`)}>
              Añadir
            </button>
          </div>
        )}
      </header>
      {msg && <p className="border-b border-slate-100 px-4 py-2 text-sm text-slate-600">{msg}</p>}
      <div className="grid gap-px bg-slate-100 sm:grid-cols-2 lg:grid-cols-4">
        {data.items.map((i) => (
          <div key={i.symbol} className={`flex items-center justify-between gap-2 bg-white px-3 py-2 text-sm ${i.active ? "" : "opacity-50"}`}>
            <span className="min-w-0">
              <span className="block truncate font-medium text-slate-800">{i.name}</span>
              <span className="text-xs text-slate-500">
                {i.symbol} · {i.lastError ? <span className="text-red-600">error</span> : i.lastCandle ? dayFmt(i.lastCandle) : "sin datos"}
              </span>
            </span>
            {canManage && !i.isIndex && (
              <button
                type="button"
                className="text-xs text-blue-700 hover:underline disabled:opacity-50"
                disabled={busy}
                onClick={() => run({ op: "toggle", symbol: i.symbol, active: !i.active }, i.active ? `${i.symbol} desactivado` : `${i.symbol} activado`)}
              >
                {i.active ? "Quitar" : "Activar"}
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/** Página de reglas: ajustes de la cartera y reinicio. */
export function RulesPanel() {
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setData(await api<Detail>("account"));
    } catch (e) {
      setError(errorText(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useTradingRefresh(load);
  if (error) return <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>;
  if (!data)
    return (
      <div className="flex h-40 items-center justify-center border border-slate-200 bg-white">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  return <Settings summary={data.summary} onSaved={async () => refreshTrading()} />;
}
