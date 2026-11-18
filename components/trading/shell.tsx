"use client";
// Estructura propia de Trading, separada de la app general (sin su barra superior, su menú ni el chat):
// - móvil (< 768 px): barra fina arriba con el menú (hamburguesa) y el título, y abajo las cuatro secciones
//   principales solo con iconos. El menú es el de la cuenta (Conexiones y lo que vendrá). Arrastrar hacia
//   abajo desde arriba actualiza la pantalla.
// - tablet en vertical (768-1023 px): barra lateral estrecha solo con iconos; el menú completo se abre
//   con la hamburguesa de la barra.
// - tablet en horizontal y ordenador (≥ 1024 px): barra lateral completa, como antes.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Menu, X } from "lucide-react";
import { AgentAvatar } from "./ui";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { TradingNavigation, TradingNavigationHeader, type TradingProfile } from "./navigation";
import { prefetchTrading } from "./format";
import { BottomTabs, MobileMenu, PullToRefresh } from "./mobile-nav";
import { BellButton, NotificationsScreen, useNotifications } from "./notifications";

// Lo que leen Inicio (Operadores y Actividad), Oportunidades, Mi cartera y Agentes.
const PREFETCH = ["summary", "notifications", "pulse", "portfolio", "agents", "faro", "mine", "mirror", "wallets?history=1", "manual"];
import { isFittedTab, isTradingTab, TRADING_PRIMARY_TABS, TRADING_TABS } from "./tabs";
import { MobileAppHeader } from "@/components/platform/mobile-app-header";

/** Lo que una pantalla «hija» (la página de un agente) le dice a la estructura: su título y a dónde volver. */
type Meta = { title?: string; back?: { href: string; label: string }; color?: string };
const MetaContext = createContext<(m: Meta | null) => void>(() => undefined);

/** Desde una página: fija el título y el «volver» de la barra mientras esté abierta. */
export function ShellMeta({ title, back, color }: Meta) {
  const set = useContext(MetaContext);
  const backHref = back?.href;
  const backLabel = back?.label;
  useEffect(() => {
    set({ title, color, back: backHref && backLabel ? { href: backHref, label: backLabel } : undefined });
    return () => set(null);
  }, [set, title, color, backHref, backLabel]);
  return null;
}

const hrefOf = (key: string) => (key === "mercados" ? "/trading/mercados?tab=valores" : `/trading/${key}`);

/**
 * Va en el layout de /trading: se queda montada al cambiar de sección (el menú, Mi dinero y la barra no
 * se recargan) y solo cambia el contenido. El título y el icono salen de la ruta.
 */
export function TradingShell({ children, user }: { children: ReactNode; user: TradingProfile }) {
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean);
  const section = parts[1] && isTradingTab(parts[1]) ? parts[1] : "inicio";
  const child = parts.length > 2;
  const primary = !child && TRADING_PRIMARY_TABS.includes(section);
  const tabDef = TRADING_TABS.find((t) => t.key === section) ?? TRADING_TABS[0];
  const [meta, setMeta] = useState<Meta | null>(null);
  const title = meta?.title ?? tabDef.label;
  const back = primary ? undefined : child
    ? meta?.back ?? { href: `/trading/${section}`, label: tabDef.label }
    : { href: "/trading/inicio", label: "Inicio" };
  const fitted = child || isFittedTab(section);
  const Icon = tabDef.icon;
  const [open, setOpen] = useState(false);
  const scroller = useRef<HTMLElement>(null);
  // Notificaciones: la campana (y el aviso de «Todo funciona» del Resumen) abren la pantalla de avisos.
  const notes = useNotifications();
  const [notesOpen, setNotesOpen] = useState(false);
  useEffect(() => {
    const h = () => setNotesOpen(true);
    window.addEventListener("trading:notifications", h);
    return () => window.removeEventListener("trading:notifications", h);
  }, []);
  useEffect(() => setNotesOpen(false), [pathname]);
  const unread = notes.data?.unread ?? 0;
  // Tras la primera carga, el resto de pantallas se va leyendo en segundo plano.
  useEffect(() => prefetchTrading(PREFETCH), []);
  // Al navegar, el menú se cierra solo.
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="flex h-dvh min-h-0 w-full overflow-hidden bg-white text-foreground">
      {/* Ordenador y tablet en horizontal: barra lateral completa. */}
      <aside className="hidden w-72 shrink-0 border-r border-slate-200/70 bg-slate-50/40 lg:block">
        <TradingNavigation user={user} />
      </aside>

      {/* Tablet en vertical: iconos. */}
      <aside className="hidden w-16 shrink-0 flex-col items-center gap-1 border-r border-slate-200/70 bg-slate-50/40 py-3 md:flex lg:hidden">
        <button type="button" onClick={() => setOpen(true)} aria-label="Abrir el menú" className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl text-slate-600 hover:bg-white">
          <Menu className="h-5 w-5" />
        </button>
        {TRADING_TABS.map((t) => {
          const on = pathname === `/trading/${t.key}` || pathname.startsWith(`/trading/${t.key}/`);
          return (
            <Link
              key={t.key}
              href={hrefOf(t.key)}
              title={t.label}
              aria-label={t.label}
              aria-current={on ? "page" : undefined}
              className={`flex h-11 w-11 items-center justify-center rounded-xl ${on ? "bg-blue-50 text-blue-600" : "text-slate-500 hover:bg-white"}`}
            >
              <t.icon className="h-5 w-5" />
            </Link>
          );
        })}
      </aside>

      <div
        className={`flex min-h-0 min-w-0 flex-1 flex-col transition-transform duration-300 ease-out ${notesOpen ? "-translate-x-1/4 md:translate-x-0" : ""}`}
      >
        <MobileAppHeader
          primary={primary}
          onMenuClick={() => setOpen(true)}
          backHref={back?.href}
          title={
            <>
              {back && meta?.color ? (
                <AgentAvatar color={meta.color} size="sm" />
              ) : !back ? (
                <Icon className="h-4 w-4 shrink-0 text-blue-600" />
              ) : null}
              <span className="truncate">{title}</span>
            </>
          }
          right={<BellButton unread={unread} onClick={() => setNotesOpen(true)} />}
        />

        {/* Tablet y ordenador: cabecera grande. */}
        <div className="hidden shrink-0 items-start gap-3 px-6 pb-3 pt-5 md:flex lg:px-8">
          <div className="min-w-0 flex-1">
          {back ? (
            <nav aria-label="Ruta" className="flex min-w-0 items-center gap-2 text-[26px] font-semibold leading-[1.2] tracking-tight">
              <Link href={back.href} className="flex shrink-0 items-center gap-2 text-slate-400 hover:text-slate-700">
                <ArrowLeft className="h-5 w-5" />
                {back.label}
              </Link>
              <span className="text-slate-300">/</span>
              <span className="truncate text-slate-950">{title}</span>
            </nav>
          ) : (
            <h1 className="flex min-w-0 items-center gap-3 text-[26px] font-semibold leading-[1.2] tracking-tight text-slate-950">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Icon className="h-5 w-5" />
              </span>
              <span className="truncate">{title}</span>
            </h1>
          )}
          </div>
          <BellButton unread={unread} onClick={() => setNotesOpen(true)} className="-mr-2 -mt-0.5" />
        </div>

        <main
          ref={scroller}
          className={`min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain px-3 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-3 md:px-6 md:pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:pt-0 lg:px-8 ${
            fitted ? "lg:flex lg:flex-col lg:overflow-hidden lg:pb-6" : ""
          }`}
        >
          <MetaContext.Provider value={setMeta}>
            <PullToRefresh scroller={scroller}>{children}</PullToRefresh>
          </MetaContext.Provider>
        </main>
      </div>

      {/* Móvil: las cuatro secciones principales abajo, solo con iconos. */}
      <BottomTabs />

      <NotificationsScreen open={notesOpen} onClose={() => setNotesOpen(false)} data={notes.data} markRead={notes.markRead} />

      {/* Menú completo (móvil y tablet en vertical). */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="left"
          showCloseButton={false}
          // A pantalla completa en móvil (el componente base deja 3/4) y empezando siempre arriba.
          className="gap-0 p-0 data-[side=left]:w-full data-[side=left]:sm:max-w-sm lg:hidden"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <SheetTitle className="sr-only">Menú de Trading</SheetTitle>
          {/* Móvil: menú de cuenta (las secciones están abajo). */}
          <div className="h-full md:hidden">
            <MobileMenu user={user} onClose={() => setOpen(false)} />
          </div>
          {/* Tablet en vertical: el menú completo de siempre. */}
          <div className="hidden h-full min-h-0 flex-col pt-[env(safe-area-inset-top)] md:flex">
            <div className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-200/70 px-2 pr-4">
              <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar el menú" className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-700 active:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
              <TradingNavigationHeader onNavigate={() => setOpen(false)} />
            </div>
            <div className="min-h-0 flex-1">
              <TradingNavigation user={user} large onNavigate={() => setOpen(false)} />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
