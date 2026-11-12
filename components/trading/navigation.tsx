"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import type { getWallets } from "@/lib/trading/wallets";
import { TRADING_SECTIONS } from "./tabs";
import { api, errorText, eur, eur0, tone } from "./format";

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
  opened: boolean;
  canManage: boolean;
  /** Revisión del precio en directo hecha en esta consulta (null si no tocaba o falló). */
  live?: { updated: number; filled: number; cancelled: number; skipped?: string } | null;
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


export function TradingNavigation() {
  const pathname = usePathname();
  const [status, setStatus] = useState<TradingStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const auto = useRef(false);

  const load = useCallback(() => {
    api<TradingStatus>("status")
      .then((st) => {
        setStatus(st);
        // Si han entrado precios nuevos u órdenes ejecutadas en la apertura, se refresca todo el módulo.
        if (st.live && (st.live.updated || st.live.filled || st.live.cancelled)) refreshTrading();
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => load(), [load]);
  useTradingRefresh(load);
  // Mientras la pantalla esté abierta, se revisa cada 3 minutos (precio en directo, kamikazes y reuniones).
  useEffect(() => {
    const id = window.setInterval(load, 3 * 60_000);
    return () => window.clearInterval(id);
  }, [load]);

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
                    className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${active ? "bg-blue-50 font-semibold text-blue-600" : "text-slate-600 hover:bg-slate-50"}`}
                  >
                    <t.icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{t.label}</span>
                    {t.key === "cartera" && status && status.openPositions + status.pendingOrders > 0 && (
                      <span className="ml-auto rounded-full bg-slate-100 px-2 text-[11px] font-semibold text-slate-600">
                        {status.openPositions + status.pendingOrders}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <MoneyPanel status={status} syncing={syncing} msg={msg} onSync={sync} />
      </div>
    </div>
  );
}

type Wallets = Awaited<ReturnType<typeof getWallets>>;

/** Sin velas de cierre en más de 4 días (o con valores sin datos): algo no ha corrido solo. */
const isStale = (s: TradingStatus) =>
  s.instrumentsWithData < s.instruments || !s.asOf || Date.now() - new Date(s.asOf).getTime() > 4 * 86_400_000;

function BrokerLogo({ src, muted }: { src: string | null; muted?: boolean }) {
  return (
    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-white ${muted ? "opacity-60 grayscale" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- logotipos externos pequeños */}
      {src ? <img src={src} alt="" className="h-5 w-5 object-contain" /> : <Link2 className="h-4 w-4 text-slate-400" />}
    </span>
  );
}

/** Panel lateral: tu dinero real en cada exchange conectado y, discreta, la cartera virtual. */
function MoneyPanel({ status, syncing, msg, onSync }: { status: TradingStatus | null; syncing: boolean; msg: string | null; onSync: () => void }) {
  const [wallets, setWallets] = useState<Wallets | null>(null);
  const load = useCallback(() => {
    api<Wallets>("wallets").then(setWallets, () => undefined);
  }, []);
  useEffect(() => load(), [load]);
  useTradingRefresh(load);
  useEffect(() => {
    const id = window.setInterval(load, 3 * 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  const items = wallets?.items ?? [];
  const reals = items.filter((i) => i.environment === "real");
  return (
    <div className="mx-3 mb-3 rounded-2xl border border-slate-100 bg-white p-4 text-sm shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Mi dinero</div>
      {!wallets ? (
        <div className="mt-2 h-7 w-28 animate-pulse rounded-md bg-slate-100" />
      ) : items.length === 0 ? (
        <Link href="/trading/integraciones" className="mt-1 inline-block text-sm font-medium text-blue-700 hover:underline">
          Conecta un exchange →
        </Link>
      ) : (
        <>
          {reals.length > 1 && <div className="mt-1 text-xl font-bold tracking-tight tabular-nums text-slate-900">{eur(wallets.total, 2)}</div>}
          <ul className="mt-2 space-y-2.5">
            {items.map((w) => {
              const muted = !w.operating;
              return (
                <li key={w.id}>
                  <Link href="/trading/integraciones" className="flex items-center gap-2.5 rounded-lg hover:bg-slate-50">
                    <BrokerLogo src={w.logo} muted={muted} />
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-xs font-semibold ${muted ? "text-slate-500" : "text-slate-900"}`}>
                        {w.name}
                        {w.environment !== "real" && <span className="ml-1 font-normal text-slate-400">demo</span>}
                      </span>
                      <span className="block truncate text-[11px] text-slate-400">
                        {w.error ? "No se pudo leer el saldo" : w.operating ? (w.copies ? `Opera · ${w.copies.copies} ${w.copies.copies === 1 ? "copia" : "copias"}` : "Opera") : "Solo consulta"}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className={`block tabular-nums ${muted ? "text-xs text-slate-500" : "text-sm font-bold text-slate-900"}`}>
                        {w.total === null ? "—" : w.currency === "EUR" ? eur(w.total, 2) : `${w.total.toFixed(2)} ${w.currency}`}
                      </span>
                      {w.operating && w.copies && (
                        <span className={`block text-[11px] font-semibold tabular-nums ${tone(w.copies.result)}`}>
                          {w.copies.result >= 0 ? "+" : ""}
                          {eur(w.copies.result, 2)}
                          {w.copies.pct !== null && ` · ${w.copies.pct >= 0 ? "+" : ""}${w.copies.pct.toFixed(1).replace(".", ",")} %`}
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {status && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          {status.opened ? (
            <Link href="/trading/cartera" className="flex items-center justify-between gap-2 text-xs text-slate-500 hover:text-slate-700">
              <span>Cartera virtual</span>
              <span className="tabular-nums">
                {eur0(status.equity)} <span className={tone(status.returnPct)}>{status.returnPct >= 0 ? "+" : ""}{status.returnPct.toFixed(1).replace(".", ",")} %</span>
              </span>
            </Link>
          ) : (
            <Link href="/trading/inicio" className="text-xs text-slate-500 hover:text-slate-700">
              Cartera virtual: ábrela →
            </Link>
          )}
        </div>
      )}
      {/* Los datos se actualizan solos (proceso diario y precio en directo). Solo si se quedan atrás, se ofrece forzarlo. */}
      {status?.canManage && !syncing && isStale(status) && (
        <button type="button" onClick={onSync} className="mt-2 text-[11px] font-medium text-amber-700 hover:underline">
          Datos del {status.asOf ?? "—"}: actualizar
        </button>
      )}
      {(syncing || msg) && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-400">
          {syncing && <Loader2 className="h-3 w-3 animate-spin" />} {msg}
        </p>
      )}
    </div>
  );
}
