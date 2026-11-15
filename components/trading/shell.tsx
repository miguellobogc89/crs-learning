"use client";
// Estructura propia de Trading, separada de la app general (sin su barra superior, su menú ni el chat):
// - móvil (< 768 px): barra fina arriba con el menú (hamburguesa) y el título; todo a pantalla completa.
//   El menú se abre a pantalla completa con las secciones, tu dinero y el mercado.
// - tablet en vertical (768-1023 px): barra lateral estrecha solo con iconos; el menú completo se abre
//   con la hamburguesa de la barra.
// - tablet en horizontal y ordenador (≥ 1024 px): barra lateral completa, como antes.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, Menu, X } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { TradingNavigation } from "./navigation";
import { prefetchTrading } from "./format";

// Lo que leen Inicio (Operadores y Actividad), Oportunidades, Mi cartera y Agentes.
const PREFETCH = ["portfolio", "agents", "faro", "mine", "mirror", "wallets?history=1", "manual"];
import { isFittedTab, isTradingTab, TRADING_TABS } from "./tabs";

/** Lo que una pantalla «hija» (la página de un agente) le dice a la estructura: su título y a dónde volver. */
type Meta = { title?: string; back?: { href: string; label: string } };
const MetaContext = createContext<(m: Meta | null) => void>(() => undefined);

/** Desde una página: fija el título y el «volver» de la barra mientras esté abierta. */
export function ShellMeta({ title, back }: Meta) {
  const set = useContext(MetaContext);
  const backHref = back?.href;
  const backLabel = back?.label;
  useEffect(() => {
    set({ title, back: backHref && backLabel ? { href: backHref, label: backLabel } : undefined });
    return () => set(null);
  }, [set, title, backHref, backLabel]);
  return null;
}

const hrefOf = (key: string) => (key === "mercados" ? "/trading/mercados?tab=valores" : `/trading/${key}`);

/**
 * Va en el layout de /trading: se queda montada al cambiar de sección (el menú, Mi dinero y la barra no
 * se recargan) y solo cambia el contenido. El título y el icono salen de la ruta.
 */
export function TradingShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean);
  const section = parts[1] && isTradingTab(parts[1]) ? parts[1] : "inicio";
  const child = parts.length > 2;
  const tabDef = TRADING_TABS.find((t) => t.key === section) ?? TRADING_TABS[0];
  const [meta, setMeta] = useState<Meta | null>(null);
  const title = meta?.title ?? (child ? "" : tabDef.label);
  const back = child ? meta?.back ?? { href: `/trading/${section}`, label: tabDef.label } : undefined;
  const fitted = child || isFittedTab(section);
  const Icon = tabDef.icon;
  const [open, setOpen] = useState(false);
  // Tras la primera carga, el resto de pantallas se va leyendo en segundo plano.
  useEffect(() => prefetchTrading(PREFETCH), []);
  // Al navegar, el menú se cierra solo.
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="flex h-dvh min-h-0 w-full overflow-hidden bg-white text-foreground">
      {/* Ordenador y tablet en horizontal: barra lateral completa. */}
      <aside className="hidden w-64 shrink-0 border-r border-slate-200/70 bg-slate-50/40 lg:block">
        <TradingNavigation />
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

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Móvil: barra fina con el menú y el título. */}
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-slate-200/70 bg-white/95 px-2 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden">
          <button type="button" onClick={() => setOpen(true)} aria-label="Abrir el menú" className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-700 active:bg-slate-100">
            <Menu className="h-5 w-5" />
          </button>
          {back ? (
            <Link href={back.href} className="flex min-w-0 items-center gap-1.5 text-[17px] font-semibold text-slate-900">
              <ArrowLeft className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="truncate">{title}</span>
            </Link>
          ) : (
            <h1 className="flex min-w-0 items-center gap-2 text-[17px] font-semibold text-slate-900">
              <Icon className="h-4 w-4 shrink-0 text-blue-600" />
              <span className="truncate">{title}</span>
            </h1>
          )}
        </header>

        {/* Tablet y ordenador: cabecera grande. */}
        <div className="hidden shrink-0 px-6 pb-3 pt-5 md:block lg:px-8">
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

        <main
          className={`min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3 md:px-6 md:pt-0 lg:px-8 ${
            fitted ? "lg:flex lg:flex-col lg:overflow-hidden lg:pb-6" : ""
          }`}
        >
          <MetaContext.Provider value={setMeta}>{children}</MetaContext.Provider>
        </main>
      </div>

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
          <div className="flex h-full min-h-0 flex-col pt-[env(safe-area-inset-top)]">
            <div className="flex h-14 shrink-0 items-center justify-between px-2">
              <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar el menú" className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-700 active:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
              <Link href="/dashboard" className="px-3 text-sm font-medium text-slate-500 active:text-slate-900">
                Ir a Crussader
              </Link>
            </div>
            <div className="min-h-0 flex-1">
              <TradingNavigation large />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
