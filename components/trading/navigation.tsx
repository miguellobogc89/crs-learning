"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Loader2, RefreshCw } from "lucide-react";
import { TRADING_SECTIONS } from "./tabs";
import { api, dayFmt, errorText, eur0, pct, tone } from "./format";

export type TradingStatus = {
  regime: "alcista" | "bajista" | "lateral";
  cryptoRegime: "alcista" | "bajista" | "lateral" | null;
  asOf: string | null;
  instruments: number;
  instrumentsWithData: number;
  equity: number;
  cash: number;
  returnPct: number;
  openPositions: number;
  pendingOrders: number;
  autoTrade: boolean;
  canManage: boolean;
};

type SyncResult = {
  market: { updated: number; failed: { symbol: string; error: string }[]; pending: number };
  backtest: { asOf: string; trades: number } | null;
  accounts: { filled: number; closed: number; autoOpened: number };
  pending: boolean;
};

export const REFRESH_EVENT = "trading:refresh";
export function refreshTrading() {
  window.dispatchEvent(new Event(REFRESH_EVENT));
}

/** Recarga cuando cualquier parte del módulo avisa de cambios. */
export function useTradingRefresh(fn: () => void) {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  }, [fn]);
  useEffect(() => {
    const h = () => ref.current();
    window.addEventListener(REFRESH_EVENT, h);
    return () => window.removeEventListener(REFRESH_EVENT, h);
  }, []);
}

const REGIME = {
  alcista: { label: "Alcista", dot: "bg-emerald-500", text: "El mercado sube: buen momento para compras." },
  bajista: { label: "Bajista", dot: "bg-red-500", text: "El mercado baja: más prudencia con las compras." },
  lateral: { label: "Lateral", dot: "bg-slate-400", text: "El mercado no tiene una dirección clara." },
} as const;

export function TradingNavigation() {
  const pathname = usePathname();
  const [status, setStatus] = useState<TradingStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const auto = useRef(false);

  const load = useCallback(() => {
    api<TradingStatus>("status").then(setStatus).catch(() => undefined);
  }, []);
  useEffect(() => load(), [load]);
  useTradingRefresh(load);

  const sync = useCallback(async () => {
    setSyncing(true);
    setMsg("Descargando cotizaciones…");
    try {
      let updated = 0;
      const failed = new Set<string>();
      let last: SyncResult | null = null;
      for (let round = 0; round < 12; round++) {
        last = await api<SyncResult>("sync", {});
        updated += last.market.updated;
        last.market.failed.forEach((f) => failed.add(f.symbol));
        if (!last.pending) break;
        setMsg(`Descargando… quedan ${last.market.pending} valores`);
      }
      const parts = [`${updated} valores al día`];
      if (last?.accounts.filled) parts.push(`${last.accounts.filled} órdenes ejecutadas`);
      if (last?.accounts.closed) parts.push(`${last.accounts.closed} posiciones cerradas`);
      if (last?.accounts.autoOpened) parts.push(`${last.accounts.autoOpened} órdenes automáticas`);
      if (failed.size) parts.push(`sin datos: ${[...failed].join(", ")}`);
      setMsg(parts.join(" · "));
      refreshTrading();
    } catch (e) {
      setMsg(errorText(e));
    } finally {
      setSyncing(false);
    }
  }, []);

  // Primera vez sin datos: arranca la descarga sola.
  useEffect(() => {
    if (status && !auto.current && status.instrumentsWithData === 0 && status.canManage) {
      auto.current = true;
      void sync();
    }
  }, [status, sync]);


  return (
    <div className="flex h-full min-h-0 flex-col">
      <h2 className="border-b border-slate-200/60 px-5 py-4 text-sm font-semibold">Trading</h2>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <nav aria-label="Trading" className="space-y-4 p-3">
          {TRADING_SECTIONS.map((section) => (
            <div key={section.title ?? "main"} className="space-y-1">
              {section.title && <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{section.title}</p>}
              {section.items.map((t) => {
                const active = pathname === `/trading/${t.key}`;
                return (
                  <Link
                    key={t.key}
                    href={`/trading/${t.key}`}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2 px-3 py-2 text-sm ${active ? "bg-blue-50 font-semibold text-blue-600" : "text-slate-600 hover:bg-slate-50"}`}
                  >
                    <t.icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{t.label}</span>
                    {t.key === "cartera" && status && status.openPositions + status.pendingOrders > 0 && (
                      <span className="ml-auto bg-slate-100 px-1.5 text-[11px] font-semibold text-slate-600">
                        {status.openPositions + status.pendingOrders}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="mx-3 mb-3 space-y-3 border border-slate-200 bg-white p-3 text-sm">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Mi patrimonio virtual</div>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span className="text-lg font-semibold tabular-nums text-slate-900">{status ? eur0(status.equity) : "—"}</span>
              {status && <span className={`text-xs ${tone(status.returnPct)}`}>{pct(status.returnPct)}</span>}
            </div>
            {status && (
              <div className="text-xs text-slate-500">
                {eur0(status.cash)} en efectivo · {status.openPositions} abiertas
                {status.pendingOrders ? ` · ${status.pendingOrders} pendientes` : ""}
              </div>
            )}
            {status?.autoTrade && (
              <div className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-blue-700">
                <Bot className="h-3.5 w-3.5" /> Modo automático activo
              </div>
            )}
          </div>
          <div className="border-t border-slate-100 pt-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Cómo está el mercado</div>
            {status ? (
              <div className="mt-1 space-y-1.5">
                {[
                  { label: "Bolsa (IBEX 35)", r: REGIME[status.regime] },
                  ...(status.cryptoRegime ? [{ label: "Crypto (Bitcoin)", r: REGIME[status.cryptoRegime] }] : []),
                ].map(({ label, r }) => (
                  <div key={label} className="flex items-center justify-between gap-2" title={r.text}>
                    <span className="text-xs text-slate-600">{label}</span>
                    <span className="flex items-center gap-1.5 text-xs font-medium text-slate-900">
                      <span className={`h-2 w-2 ${r.dot}`} /> {r.label}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-slate-400">—</div>
            )}
          </div>
          <div className="border-t border-slate-100 pt-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Datos</div>
            <div className="text-xs text-slate-600">
              Cierre del {dayFmt(status?.asOf)}
              {status ? ` · ${status.instrumentsWithData}/${status.instruments} valores` : ""}
            </div>
            {status?.canManage && (
              <button
                type="button"
                onClick={sync}
                disabled={syncing}
                className="mt-2 inline-flex w-full items-center justify-center gap-1.5 border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                {syncing ? "Actualizando…" : "Actualizar cotizaciones"}
              </button>
            )}
            {msg && <p className="mt-2 text-xs text-slate-500">{msg}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
