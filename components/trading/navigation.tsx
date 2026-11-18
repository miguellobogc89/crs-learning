"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronRight, LayoutGrid, Link2, Loader2, LogOut, PiggyBank, Settings, UserCircle } from "lucide-react";
import { logout } from "@/app/actions/auth";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { getWallets } from "@/lib/trading/wallets";
import type { MarketPhase } from "@/lib/trading/chip/phase";
import { CARTERA_REAL_HREF, CARTERA_VIRTUAL_HREF, TRADING_SECTIONS } from "./tabs";
import { api, errorText, eur, eur0, peek, tone } from "./format";

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

/**
 * Arranque en caliente: antes de pintar, pone en el estado lo último que se leyó de `path` (caché de
 * format.ts), si aún no hay nada. Así una pantalla ya visitada se ve al instante y se actualiza después.
 * En un efecto (no en el useState inicial) para que no difiera de lo que pintó el servidor.
 */
export function useWarmStart<T>(path: string, set: (fn: (v: T | null) => T | null) => void) {
  useLayoutEffect(() => {
    const cached = peek<T>(path);
    if (cached) set((v) => v ?? cached);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
  }, [path]);
}

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


function PortfolioSwitcher({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const virtual = pathname === CARTERA_REAL_HREF && params.get("modo") === "virtual";

  return (
    <nav aria-label="Tipo de cartera" className="flex shrink-0 rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
      {([
        { href: CARTERA_REAL_HREF, label: "Real", active: !virtual },
        { href: CARTERA_VIRTUAL_HREF, label: "Virtual", active: virtual },
      ]).map(({ href, label, active }) => (
        <Link
          key={href}
          href={href}
          onClick={onNavigate}
          aria-current={pathname === CARTERA_REAL_HREF && active ? "page" : undefined}
          className={`rounded-md px-2 py-1.5 ${active ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function TradingNavigationHeader({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
      <Link href="/trading/inicio" onClick={onNavigate} aria-label="Inicio de Trading" className="inline-flex shrink-0 items-center">
        <Image src="/logo/logo.png" alt="" width={28} height={28} className="size-7 shrink-0 object-contain" />
      </Link>
      <Suspense fallback={<div className="h-8 w-24 shrink-0 rounded-lg bg-slate-100" />}>
        <PortfolioSwitcher onNavigate={onNavigate} />
      </Suspense>
    </div>
  );
}

export type TradingProfile = {
  canAccessBusiness: boolean;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

function TradingUserMenu({ user, inDrawer = false }: { user: TradingProfile; inDrawer?: boolean }) {
  const name = user.name ?? "Usuario";
  return (
    <div className="shrink-0 border-t border-slate-200/60 px-3 py-2">
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="group flex w-full min-w-0 items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-slate-100 focus-visible:bg-slate-100 data-[state=open]:bg-slate-100"
          >
            <span className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
              {user.image ? (
                <Image src={user.image} alt="" width={36} height={36} className="size-9 rounded-full object-cover" />
              ) : (
                <UserCircle className="size-6" aria-hidden="true" />
              )}
              <span aria-hidden="true" className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-emerald-500 ring-2 ring-white" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-slate-900" title={name}>{name}</span>
              {user.email && <span className="block truncate text-xs text-slate-500" title={user.email}>{user.email}</span>}
              <span className="sr-only">Conectado</span>
            </span>
            <ChevronRight
              aria-hidden="true"
              className="size-4 shrink-0 text-slate-500 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 group-data-[state=open]:opacity-100"
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side={inDrawer ? "top" : "right"} align={inDrawer ? "start" : "end"} sideOffset={8} className="pointer-events-auto z-[60] w-48">
          <DropdownMenuItem asChild>
            <Link href="/apps"><LayoutGrid /> Mis aplicaciones</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={user.canAccessBusiness ? "/settings" : "/trading/integraciones"}><Settings /> Configuración</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/finanzas/inicio"><PiggyBank /> Ir a Mis finanzas</Link>
          </DropdownMenuItem>
          {user.canAccessBusiness && (
            <DropdownMenuItem asChild>
              <Link href="/dashboard"><ArrowLeft /> Ir a Mi negocio</Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void logout()} variant="destructive">
            <LogOut /> Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Menú de Trading: secciones, tu dinero y el mercado. `large`: dentro del menú de móvil/tablet (todo con scroll, botones grandes). */
export function TradingNavigation({ user, large = false, onNavigate }: { user: TradingProfile; large?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const [status, setStatus] = useState<TradingStatus | null>(null);
  useWarmStart<TradingStatus>("status", setStatus);
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


  const items = (
    <nav aria-label="Trading" className={large ? "space-y-4 px-3 pb-3" : "space-y-4 p-3"}>
          {TRADING_SECTIONS.map((section) => (
            <div key={section.title ?? "main"} className="space-y-1">
              {section.title && <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{section.title}</p>}
              {section.items.map((t) => {
                const active = pathname === `/trading/${t.key}` || pathname.startsWith(`/trading/${t.key}/`);
                return (
                  <Link
                    key={t.key}
                    href={t.key === "mercados" ? "/trading/mercados?tab=valores" : `/trading/${t.key}`}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center rounded-xl ${large ? "gap-3 px-4 py-3.5 text-base" : "gap-2 px-3 py-2 text-sm"} ${active ? "bg-blue-50 font-semibold text-blue-600" : "text-slate-600 hover:bg-slate-50 active:bg-slate-100"}`}
                  >
                    <t.icon className={`${large ? "h-5 w-5" : "h-4 w-4"} shrink-0`} />
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
  );
  const money = <MoneyPanel status={status} syncing={syncing} msg={msg} onSync={sync} onNavigate={onNavigate} />;

  // Menú de móvil/tablet: todo seguido con un solo scroll.
  if (large)
    return (
      <div className="h-full overflow-y-auto pb-[env(safe-area-inset-bottom)]">
        {items}
        {money}
        <TradingUserMenu user={user} inDrawer />
      </div>
    );
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-slate-200/60 px-5 py-4">
        <TradingNavigationHeader />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{items}</div>
      <div className="max-h-[50%] shrink-0 overflow-y-auto">{money}</div>
      <TradingUserMenu user={user} />
    </div>
  );
}

type Wallets = Awaited<ReturnType<typeof getWallets>>;

/** Sin velas de cierre en más de 4 días (o con valores sin datos): algo no ha corrido solo. */
const isStale = (s: TradingStatus) =>
  s.instrumentsWithData < s.instruments || !s.asOf || Date.now() - new Date(s.asOf).getTime() > 4 * 86_400_000;

function BrokerLogo({ src, provider }: { src: string | null; provider: string }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-white">
      {provider === "binance" ? (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-[#F0B90B]">
          <path d="M7.34 10.08 12 5.42l4.66 4.66 2.71-2.71L12 0 4.63 7.37zM0 12l2.71-2.71L5.42 12l-2.71 2.71zm7.34 1.92L12 18.58l4.66-4.66 2.71 2.71L12 24l-7.37-7.37zM18.58 12l2.71-2.71L24 12l-2.71 2.71zM9.25 12 12 9.25 14.75 12 12 14.75z" />
        </svg>
      ) : src ? (
        // eslint-disable-next-line @next/next/no-img-element -- logotipos externos pequeños
        <img src={src} alt="" className="h-5 w-5 object-contain" />
      ) : (
        <Link2 className="h-4 w-4 text-slate-400" />
      )}
    </span>
  );
}

/** Panel lateral: tu dinero real en cada exchange conectado y, discreta, la cartera virtual. */
function MoneyPanel({ status, syncing, msg, onSync, onNavigate }: { status: TradingStatus | null; syncing: boolean; msg: string | null; onSync: () => void; onNavigate?: () => void }) {
  const [wallets, setWallets] = useState<Wallets | null>(null);
  useWarmStart<Wallets>("wallets", setWallets);
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
  const realEur = items.filter((i) => i.environment === "real" && i.currency === "EUR");
  const hasTotal = realEur.length > 0 && realEur.every((i) => i.total !== null);
  return (
    <div className="mx-3 mb-3 rounded-2xl border border-slate-100 bg-white p-4 text-sm shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Mi dinero</span>
        {wallets ? (
          <span className="whitespace-nowrap text-lg font-bold tabular-nums text-slate-900">
            {hasTotal ? eur(wallets.total, 2) : "—"}
          </span>
        ) : (
          <span className="h-6 w-20 animate-pulse rounded-md bg-slate-100" />
        )}
      </div>
      {wallets && (items.length === 0 ? (
          <Link href="/trading/integraciones" className="mt-1 inline-block text-sm font-medium text-blue-700 hover:underline">
            Conecta un exchange →
          </Link>
        ) : (
          <ul className="mt-2 space-y-2.5">
            {items.map((w) => {
              const state = w.error ? "No se pudo leer el saldo" : !w.operating ? "Solo consulta"
                : w.hasOpenPositions === true ? "Con posiciones abiertas"
                : w.hasOpenPositions === false ? "Sin posiciones abiertas" : "Posiciones no disponibles";
              const positions = w.error || !w.operating ? null : w.hasOpenPositions;
              const dot = positions === true ? "bg-emerald-500" : positions === false ? "bg-yellow-400" : "bg-slate-300";
              return (
                <li key={w.id}>
                  <Link href="/trading/integraciones" className="flex items-center gap-2 rounded-lg hover:bg-slate-50">
                    <BrokerLogo src={w.logo} provider={w.provider} />
                    <span className="flex min-w-0 flex-1 items-center gap-1.5 text-xs font-semibold text-slate-900">
                      <span className="truncate">{w.name}</span>
                      <span title={state} className={`h-2 w-2 shrink-0 rounded-full ${dot}`}>
                        <span className="sr-only">{state}</span>
                      </span>
                      {w.environment !== "real" && <span className="font-normal text-slate-500">demo</span>}
                    </span>
                    <span className="shrink-0 whitespace-nowrap text-right text-xs font-semibold tabular-nums text-slate-900">
                      {w.total === null ? "—" : w.currency === "EUR" ? eur(w.total, 2) : `${w.total.toFixed(2)} ${w.currency}`}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ))}

      <PhaseCard />

      {status && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          {status.opened ? (
            <Link href={CARTERA_VIRTUAL_HREF} onClick={onNavigate} className="flex items-center justify-between gap-2 text-xs text-slate-500 hover:text-slate-700">
              <span>Cartera virtual</span>
              <span className="whitespace-nowrap text-right tabular-nums">
                {eur0(status.equity)} <span className={tone(status.returnPct)}>{status.returnPct >= 0 ? "+" : ""}{status.returnPct.toFixed(1).replace(".", ",")} %</span>
              </span>
            </Link>
          ) : (
            <Link href={CARTERA_VIRTUAL_HREF} onClick={onNavigate} className="text-xs text-slate-500 hover:text-slate-700">
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

const days = (n: number) => `${Math.round(n)} ${Math.round(n) === 1 ? "día" : "días"}`;

/** Indicador siempre visible: ¿el mercado está en ataque o en defensa (detector de CAMALEÓN)? */
function PhaseCard() {
  const [phase, setPhase] = useState<MarketPhase | null | undefined>(undefined);
  const load = useCallback(() => {
    api<MarketPhase | null>("phase").then(setPhase, () => setPhase(null));
  }, []);
  useEffect(() => load(), [load]);
  useEffect(() => {
    const id = window.setInterval(load, 5 * 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  if (phase === undefined) return <div className="mt-3 h-16 animate-pulse rounded-xl bg-slate-50" />;
  if (!phase) return null;
  const attack = phase.mode === "ataque";
  // Si ya cruzó el nivel, cambiará al cierre de hoy si se mantiene así.
  const crossed = attack ? phase.flipPct >= 0 : phase.flipPct <= 0;
  return (
    <Link
      href="/trading/agentes/camaleon?from=cartera"
      className={`mt-3 block rounded-xl border p-3 transition hover:shadow-sm ${attack ? "border-emerald-100 bg-emerald-50/60" : "border-amber-100 bg-amber-50/60"}`}
      title="Detector de CAMALEÓN: ataque si Bitcoin está sobre sus medias de 200 y 50 días y por encima de hace 10 días. Se decide al cierre de cada día."
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Mercado</span>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold ${attack ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${attack ? "bg-emerald-500" : "bg-amber-500"}`} />
          {attack ? "Ataque" : "Defensa"}
        </span>
      </div>
      <div className="mt-1.5 text-xs text-slate-700">
        Lleva <b className="tabular-nums">{days(phase.days)}</b>
      </div>
      <div className="mt-1 text-[11px] leading-snug text-slate-500">
        {crossed ? (
          <>Si cierra hoy así, mañana pasa a {attack ? "defensa" : "ataque"}.</>
        ) : (
          <>
            Para pasar a {attack ? "defensa" : "ataque"}, Bitcoin debe {attack ? "bajar" : "subir"} a{" "}
            <b className="tabular-nums text-slate-700">{eur(phase.flipPrice, 2)}</b>.
          </>
        )}
      </div>
    </Link>
  );
}
