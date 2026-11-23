"use client";
// Estructura propia de CRS Finance, igual que la de Trading (sin la barra, el menú ni el chat de la app general):
// - móvil (< 768 px): barra fina arriba con el menú y el título, y abajo las cuatro secciones principales;
//   arrastrar hacia abajo actualiza.
// - tablet en vertical (768-1023 px): barra lateral estrecha solo con iconos.
// - tablet en horizontal y ordenador (≥ 1024 px): barra lateral completa con «Mi dinero».
import Image from "next/image";
import Link from "next/link";
import { ModuleLogo } from "@/components/ui/module-logo";
import { moduleHref } from "@/lib/app/module-domains";
import { useModuleHostname } from "@/lib/app/use-module-hostname";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ChartCandlestick, ChevronRight, Gauge, Landmark, Loader2, LogOut, Menu, Plug, RefreshCw, Settings, UserCircle, X } from "lucide-react";
import { logout } from "@/app/actions/auth";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PullToRefresh } from "@/components/trading/mobile-nav";
import { eur } from "@/components/trading/format";
import { categoryLabel } from "@/lib/finance/categories";
import { BOTTOM_TABS, FINANCE_SECTIONS, FINANCE_TABS, isFinanceTab, isFittedTab, tabDefOf } from "./tabs";
import { fapi, peek, refreshFinance, useFinanceRefresh } from "./api";
import { useHideAmounts } from "./privacy";

export type FinanceProfile = { name?: string | null; email?: string | null; image?: string | null; canAccessBusiness: boolean };

type Overview = {
  syncDue: boolean;
  liquidity: number | null;
  accounts: { id: string; bank: string | null; name: string; balance: number | null; currency: string; included: boolean }[];
  settings: { lastSyncAt: string | null };
};

const BANK_LABEL: Record<string, string> = { santander: "Santander", bbva: "BBVA", revolut: "Revolut" };

/**
 * Sincroniza los bancos si hace más de 6 h (los bancos limitan las consultas) y después pide a la IA que
 * entienda lo pendiente, por tandas, hasta terminar. Avisa a todas las pantallas al acabar cada paso.
 */
function useAutoSync() {
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const busy = useRef(false);
  const classify = useCallback(async () => {
    for (let round = 0; round < 20; round++) {
      setMsg(round === 0 ? "Entendiendo tus movimientos…" : "Entendiendo tus movimientos… (sigue)");
      const r = await fapi<{ remaining: number; ia: number; auto: number }>("classify", {});
      refreshFinance();
      if (!r.remaining) break;
    }
  }, []);
  const run = useCallback(async (force = false, sync = true) => {
    if (busy.current) return;
    busy.current = true;
    setSyncing(true);
    setMsg(force ? "Consultando los bancos…" : null);
    let note: string | null = null;
    try {
      if (sync) {
        const r = await fapi<{ inserted: number; errors: string[]; accounts: number }>("sync", { force });
        note = r.errors.length ? r.errors[0] : force || r.inserted ? (r.inserted ? `${r.inserted} movimientos nuevos` : "Todo al día") : null;
        refreshFinance();
      }
      await classify();
      setMsg(note);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "No se pudo sincronizar");
    } finally {
      busy.current = false;
      setSyncing(false);
    }
  }, [classify]);
  const checked = useRef(false);
  useEffect(() => {
    if (checked.current) return;
    checked.current = true;
    fapi<Overview & { pendingClassify: number }>("overview")
      .then((o) => (o.syncDue ? run(false) : o.pendingClassify > 0 ? run(false, false) : undefined))
      .catch(() => undefined);
  }, [run]);
  useEffect(() => {
    const h = () => void run(true);
    const c = () => void run(false, false);
    window.addEventListener("finance:sync", h);
    window.addEventListener("finance:classify", c);
    return () => {
      window.removeEventListener("finance:sync", h);
      window.removeEventListener("finance:classify", c);
    };
  }, [run]);
  return { syncing, msg, run };
}

/** Tras importar o corregir: que la IA entienda lo que haya quedado pendiente. */
export function requestClassify() {
  window.dispatchEvent(new Event("finance:classify"));
}

export function requestSync() {
  window.dispatchEvent(new Event("finance:sync"));
}

function MoneyPanel({ syncing, msg, onSync }: { syncing: boolean; msg: string | null; onSync: () => void }) {
  const [data, setData] = useState<Overview | null>(null);
  useHideAmounts();
  const load = useCallback(() => {
    fapi<Overview>("overview").then(setData, () => undefined);
  }, []);
  useEffect(() => {
    setData((d) => d ?? peek<Overview>("overview"));
    load();
  }, [load]);
  useFinanceRefresh(load);
  const accounts = data?.accounts.filter((a) => a.included) ?? [];
  return (
    <div className="mx-3 mb-3 rounded-2xl border border-slate-100 bg-white p-4 text-sm shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Mi dinero</span>
        {data ? <span className="amount whitespace-nowrap text-lg font-bold tabular-nums text-slate-900">{eur(data.liquidity, 2)}</span> : <span className="h-6 w-20 animate-pulse rounded-md bg-slate-100" />}
      </div>
      {data && (accounts.length === 0 ? (
        <Link href="/finanzas/cuentas" className="mt-1 inline-block text-sm font-medium text-blue-700 hover:underline">Conecta tus bancos →</Link>
      ) : (
        <ul className="mt-2 space-y-2">
          {accounts.map((a) => (
            <li key={a.id}>
              <Link href="/finanzas/cuentas" className="flex items-center gap-2 rounded-lg hover:bg-slate-50">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-white text-[10px] font-bold text-slate-500">
                  {(a.bank ? BANK_LABEL[a.bank] ?? a.bank : "Imp").slice(0, 3).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-900">{a.name}</span>
                <span className="amount shrink-0 whitespace-nowrap text-right text-xs font-semibold tabular-nums text-slate-900">
                  {a.balance === null ? "—" : a.currency === "EUR" ? eur(a.balance, 2) : `${a.balance.toFixed(2)} ${a.currency}`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ))}
      <button type="button" onClick={onSync} disabled={syncing} className="mt-3 flex items-center gap-1.5 text-[11px] font-medium text-slate-500 hover:text-slate-800 disabled:opacity-60">
        {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        {syncing ? "Sincronizando…" : data?.settings.lastSyncAt ? `Actualizado ${new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(data.settings.lastSyncAt))}` : "Sincronizar"}
      </button>
      {msg && !syncing && <p className="mt-1 text-[11px] text-slate-400">{msg}</p>}
    </div>
  );
}

function UserMenu({ user, inDrawer = false }: { user: FinanceProfile; inDrawer?: boolean }) {
  const name = user.name ?? "Usuario";
  const hostname = useModuleHostname();
  return (
    <div className="shrink-0 border-t border-slate-200/60 px-3 py-2">
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button type="button" className="group flex w-full min-w-0 items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-slate-100 data-[state=open]:bg-slate-100">
            <span className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
              {user.image ? <Image src={user.image} alt="" width={36} height={36} className="size-9 rounded-full object-cover" /> : <UserCircle className="size-6" aria-hidden="true" />}
              <span aria-hidden="true" className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-emerald-500 ring-2 ring-white" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-slate-900">{name}</span>
              {user.email && <span className="block truncate text-xs text-slate-500">{user.email}</span>}
            </span>
            <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-slate-500 opacity-0 transition-opacity group-hover:opacity-100 group-data-[state=open]:opacity-100" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side={inDrawer ? "top" : "right"} align={inDrawer ? "start" : "end"} sideOffset={8} className="pointer-events-auto z-[60] w-52">
          <DropdownMenuItem asChild><Link href="/finanzas/ajustes"><Settings /> Preferencias</Link></DropdownMenuItem>
          <DropdownMenuItem asChild><Link href="/consumo-ia"><Gauge /> Consumo de IA</Link></DropdownMenuItem>
          <DropdownMenuItem asChild><Link href={moduleHref("/trading/inicio", hostname)}><ChartCandlestick /> Ir a Trading</Link></DropdownMenuItem>
          {user.canAccessBusiness && <DropdownMenuItem asChild><Link href={moduleHref("/dashboard", hostname)}><ArrowLeft /> Ir a Mi negocio</Link></DropdownMenuItem>}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void logout()} variant="destructive"><LogOut /> Cerrar sesión</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function NavHeader({ onNavigate }: { onNavigate?: () => void }) {
  const hostname = useModuleHostname();
  return (
    <Link href={moduleHref("/finanzas/inicio", hostname)} onClick={onNavigate} aria-label="Inicio de Finanzas" className="inline-flex min-w-0 items-center gap-2">
      <ModuleLogo module="finance" />
      <span className="truncate text-sm font-semibold text-slate-900">CRS Finance</span>
    </Link>
  );
}

function Navigation({ user, large = false, onNavigate, sync }: { user: FinanceProfile; large?: boolean; onNavigate?: () => void; sync: ReturnType<typeof useAutoSync> }) {
  const pathname = usePathname();
  const hostname = useModuleHostname();
  const items = (
    <nav aria-label="Finanzas" className={large ? "space-y-4 px-3 pb-3" : "space-y-4 p-3"}>
      {FINANCE_SECTIONS.map((section) => (
        <div key={section.title ?? "main"} className="space-y-1">
          {section.title && <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{section.title}</p>}
          {section.items.map((t) => {
            const active = (t.key === "inicio" && pathname === "/home") || pathname === `/finanzas/${t.key}` || pathname.startsWith(`/finanzas/${t.key}/`);
            return (
              <Link
                key={t.key}
                href={moduleHref(`/finanzas/${t.key}`, hostname)}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={`flex items-center rounded-xl ${large ? "gap-3 px-4 py-3.5 text-base" : "gap-2 px-3 py-2 text-sm"} ${active ? "bg-blue-50 font-semibold text-blue-600" : "text-slate-600 hover:bg-slate-50 active:bg-slate-100"}`}
              >
                <t.icon className={`${large ? "h-5 w-5" : "h-4 w-4"} shrink-0`} />
                <span className="truncate">{t.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
  const money = <MoneyPanel syncing={sync.syncing} msg={sync.msg} onSync={() => void sync.run(true)} />;
  if (large)
    return (
      <div className="h-full overflow-y-auto pb-[env(safe-area-inset-bottom)]">
        {items}
        {money}
        <UserMenu user={user} inDrawer />
      </div>
    );
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center border-b border-slate-200/60 px-5 py-4"><NavHeader /></div>
      <div className="min-h-0 flex-1 overflow-y-auto">{items}</div>
      <div className="max-h-[50%] shrink-0 overflow-y-auto">{money}</div>
      <UserMenu user={user} />
    </div>
  );
}

function BottomTabs() {
  const pathname = usePathname();
  const hostname = useModuleHostname();
  return (
    <nav aria-label="Secciones" className="fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200/70 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {BOTTOM_TABS.map((key) => {
        const t = FINANCE_TABS.find((x) => x.key === key)!;
        const on = (key === "inicio" && pathname === "/home") || pathname === `/finanzas/${key}` || pathname.startsWith(`/finanzas/${key}/`);
        return (
          <Link key={key} href={moduleHref(`/finanzas/${key}`, hostname)} aria-label={t.label} aria-current={on ? "page" : undefined} className={`flex h-14 flex-1 items-center justify-center ${on ? "text-blue-600" : "text-slate-400 active:text-slate-600"}`}>
            <t.icon className="h-6 w-6" strokeWidth={on ? 2.4 : 2} />
          </Link>
        );
      })}
    </nav>
  );
}

/** Menú completo del móvil, como el de Trading: tu nombre arriba y, por grupos, el resto de pantallas. */
function MobileMenu({ user, onClose, sync }: { user: FinanceProfile; onClose: () => void; sync: ReturnType<typeof useAutoSync> }) {
  const hostname = useModuleHostname();
  // Como el menú de Trading: por grupos, separando cuentas de integraciones.
  const groups: { title: string; rows: { label: string; href: string; icon: typeof Plug }[] }[] = [
    {
      title: "Cuenta",
      rows: [
        { label: "Cuentas", href: "/finanzas/cuentas", icon: Landmark },
        { label: "Conexiones", href: "/finanzas/conexiones", icon: Plug },
        { label: "Preferencias", href: "/finanzas/ajustes", icon: Settings },
      ],
    },
    {
      title: "Mis apps",
      rows: [
        { label: "Ir a Trading", href: "/trading/inicio", icon: ChartCandlestick },
        ...(user.canAccessBusiness ? [{ label: "Ir a Mi negocio", href: "/dashboard", icon: ArrowLeft }] : []),
      ],
    },
  ];
  return (
    <div className="flex h-full min-h-0 flex-col bg-white pt-[env(safe-area-inset-top)]">
      <div className="flex h-14 shrink-0 items-center px-2">
        <button type="button" onClick={onClose} aria-label="Cerrar el menú" className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-700 active:bg-slate-100">
          <X className="h-6 w-6" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <div className="flex flex-col items-center gap-2 border-b border-slate-100 px-5 pb-6 pt-2">
          {user.image ? <Image src={user.image} alt="" width={64} height={64} className="h-16 w-16 rounded-full object-cover" /> : <UserCircle className="h-16 w-16 text-slate-300" aria-hidden="true" />}
          <span className="text-center text-xl font-semibold text-slate-900">{user.name ?? "Usuario"}</span>
          {user.email && <span className="text-sm text-slate-400">{user.email}</span>}
        </div>
        <div className="pt-4"><MoneyPanel syncing={sync.syncing} msg={sync.msg} onSync={() => void sync.run(true)} /></div>
        {groups.map((g) => (
          <section key={g.title} className="pt-6">
            <h2 className="px-5 pb-1 text-[15px] font-medium text-slate-400">{g.title}</h2>
            <ul>
              {g.rows.map((r) => (
                <li key={r.href}>
                  <Link href={moduleHref(r.href, hostname)} onClick={onClose} className="flex items-center gap-4 px-5 py-3.5 active:bg-slate-50">
                    <r.icon className="h-6 w-6 shrink-0 text-blue-600" />
                    <span className="flex-1 text-[17px] text-slate-900">{r.label}</span>
                    <ChevronRight className="h-5 w-5 text-slate-400" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <button type="button" onClick={() => void logout()} className="mt-8 flex w-full items-center gap-4 px-5 py-3.5 text-left active:bg-slate-50">
          <LogOut className="h-6 w-6 text-red-500" />
          <span className="text-[17px] text-slate-900">Cerrar sesión</span>
        </button>
      </div>
    </div>
  );
}

export function FinanceShell({ children, user }: { children: ReactNode; user: FinanceProfile }) {
  const pathname = usePathname();
  const hostname = useModuleHostname();
  const parts = pathname.split("/").filter(Boolean);
  const section = parts[1] && isFinanceTab(parts[1]) ? parts[1] : "inicio";
  const tabDef = tabDefOf(section);
  // Pantalla de detalle (p. ej. /finanzas/categoria/<clave>): flecha para volver.
  const isDetail = parts.length > 2 || parts[1] === "extraordinarios";
  // Hoja (una categoría o un grupo): el nombre y, a la derecha, el importe los pone la propia hoja en la cabecera
  // («finance-header-title» / «finance-header-right»). Para una categoría el nombre ya se sabe por la dirección.
  const isSheet = ((parts[1] === "categoria" || parts[1] === "grupo") && !!parts[2]) || parts[1] === "extraordinarios";
  const sheetTitle = isSheet ? (parts[1] === "categoria" && parts[2] ? categoryLabel(decodeURIComponent(parts[2])) : "") : null;
  const router = useRouter();
  const goBack = () => (window.history.length > 1 ? router.back() : router.push(`/finanzas/${section}`));
  const fitted = isFittedTab(section);
  const Icon = tabDef.icon;
  const [open, setOpen] = useState(false);
  const scroller = useRef<HTMLElement>(null);
  const sync = useAutoSync();
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="flex h-dvh min-h-0 w-full overflow-hidden bg-white text-foreground">
      <aside className="hidden w-72 shrink-0 border-r border-slate-200/70 bg-slate-50/40 lg:block">
        <Navigation user={user} sync={sync} />
      </aside>

      <aside className="hidden w-16 shrink-0 flex-col items-center gap-1 border-r border-slate-200/70 bg-slate-50/40 py-3 md:flex lg:hidden">
        <button type="button" onClick={() => setOpen(true)} aria-label="Abrir el menú" className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl text-slate-600 hover:bg-white">
          <Menu className="h-5 w-5" />
        </button>
        {FINANCE_TABS.map((t) => {
          const on = pathname === `/finanzas/${t.key}` || (t.key === "inicio" && pathname === "/home");
          return (
            <Link key={t.key} href={moduleHref(`/finanzas/${t.key}`, hostname)} title={t.label} aria-label={t.label} aria-current={on ? "page" : undefined} className={`flex h-11 w-11 items-center justify-center rounded-xl ${on ? "bg-blue-50 text-blue-600" : "text-slate-500 hover:bg-white"}`}>
              <t.icon className="h-5 w-5" />
            </Link>
          );
        })}
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-slate-200/70 bg-white/95 px-2 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden">
          {isDetail ? (
            <button type="button" onClick={goBack} aria-label="Volver" className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-700 active:bg-slate-100">
              <ArrowLeft className="h-5 w-5" />
            </button>
          ) : (
            <button type="button" onClick={() => setOpen(true)} aria-label="Abrir el menú" className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-700 active:bg-slate-100">
              <Menu className="h-5 w-5" />
            </button>
          )}
          {sheetTitle !== null ? (
            <>
              <h1 id="finance-header-title" className="min-w-0 flex-1 truncate text-[17px] font-bold text-slate-900" />
              <div id="finance-header-right" className="shrink-0 pr-2 text-right" />
            </>
          ) : (
            <h1 className="absolute left-1/2 flex max-w-[calc(100%-7rem)] -translate-x-1/2 items-center justify-center gap-2 text-[17px] font-bold text-slate-900">
              <Icon className="h-4 w-4 shrink-0 text-blue-600" />
              <span className="truncate">{tabDef.label}</span>
            </h1>
          )}
          {sync.syncing && sheetTitle === null && <Loader2 className="ml-auto mr-3 h-4 w-4 animate-spin text-slate-400" aria-label="Sincronizando" />}
        </header>

        <div className="hidden shrink-0 items-start gap-3 px-6 pb-3 pt-5 md:flex lg:px-8">
          <h1 className="flex min-w-0 flex-1 items-center gap-3 text-[26px] font-semibold leading-[1.2] tracking-tight text-slate-950">
            {isDetail ? (
              <button type="button" onClick={goBack} aria-label="Volver" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200"><ArrowLeft className="h-5 w-5" /></button>
            ) : (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Icon className="h-5 w-5" /></span>
            )}
            {sheetTitle !== null ? <span id="finance-header-title-desktop" className="truncate" /> : <span className="truncate">{tabDef.label}</span>}
          </h1>
          {sheetTitle !== null && <div id="finance-header-right-desktop" className="shrink-0 pt-1 text-right" />}
          {sync.syncing && <span className="mt-2 flex items-center gap-1.5 text-xs text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Sincronizando</span>}
        </div>

        <main
          ref={scroller}
          className={`min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain px-3 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-3 md:px-6 md:pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:pt-0 lg:px-8 ${fitted ? "lg:flex lg:flex-col lg:overflow-hidden lg:pb-6" : ""}`}
        >
          <PullToRefresh scroller={scroller} onRefresh={refreshFinance}>{children}</PullToRefresh>
        </main>
      </div>

      <BottomTabs />

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" showCloseButton={false} className="gap-0 p-0 data-[side=left]:w-full data-[side=left]:sm:max-w-sm lg:hidden" onOpenAutoFocus={(e) => e.preventDefault()}>
          <SheetTitle className="sr-only">Menú de Finanzas</SheetTitle>
          <div className="h-full md:hidden"><MobileMenu user={user} onClose={() => setOpen(false)} sync={sync} /></div>
          <div className="hidden h-full min-h-0 flex-col pt-[env(safe-area-inset-top)] md:flex">
            <div className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-200/70 px-2 pr-4">
              <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar el menú" className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-700 active:bg-slate-100"><X className="h-5 w-5" /></button>
              <NavHeader onNavigate={() => setOpen(false)} />
            </div>
            <div className="min-h-0 flex-1"><Navigation user={user} large sync={sync} onNavigate={() => setOpen(false)} /></div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
