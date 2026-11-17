"use client";
// Navegación de Trading en el móvil (< 768 px), como una app:
// - barra inferior solo con iconos: Inicio, Oportunidades, Agentes y Mi cartera;
// - menú (hamburguesa) estilo app de exchange: tu nombre arriba y, por grupos, Conexiones y lo que
//   llegará más adelante (en gris, sin enlace), con «Cerrar sesión» al final;
// - arrastrar hacia abajo desde arriba del todo para actualizar la pantalla (con efecto muelle).
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { ArrowLeft, Bot, ChevronRight, Flame, Gift, Home, LifeBuoy, LogOut, PiggyBank, Plug, RefreshCw, UserCircle, UserCog, Wallet, X } from "lucide-react";
import { logout } from "@/app/actions/auth";
import { refreshTrading } from "./navigation";
import type { TradingProfile } from "./navigation";

const TABS = [
  { href: "/trading/inicio", label: "Inicio", icon: Home },
  { href: "/trading/oportunidades", label: "Oportunidades", icon: Flame },
  { href: "/trading/agentes", label: "Agentes", icon: Bot },
  { href: "/trading/cartera", label: "Mi cartera", icon: Wallet },
] as const;

/** Barra inferior: cuatro iconos, sin texto. Respeta la zona de la rayita del iPhone. */
export function BottomTabs() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Secciones"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200/70 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      {TABS.map((t) => {
        const on = pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-label={t.label}
            aria-current={on ? "page" : undefined}
            className={`flex h-14 flex-1 items-center justify-center ${on ? "text-blue-600" : "text-slate-400 active:text-slate-600"}`}
          >
            <t.icon className="h-6 w-6" strokeWidth={on ? 2.4 : 2} />
          </Link>
        );
      })}
    </nav>
  );
}

type Item = { label: string; icon: typeof Plug; href?: string; soon?: boolean };

function MenuRow({ item, onNavigate }: { item: Item; onNavigate: () => void }) {
  const body = (
    <>
      <item.icon className={`h-6 w-6 shrink-0 ${item.soon ? "text-slate-300" : "text-blue-600"}`} />
      <span className={`flex-1 text-[17px] ${item.soon ? "text-slate-400" : "text-slate-900"}`}>{item.label}</span>
      {item.soon ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-400">Pronto</span> : <ChevronRight className="h-5 w-5 text-slate-400" />}
    </>
  );
  if (item.soon || !item.href) return <li className="flex items-center gap-4 px-5 py-3.5" aria-disabled="true">{body}</li>;
  return (
    <li>
      <Link href={item.href} onClick={onNavigate} className="flex items-center gap-4 px-5 py-3.5 active:bg-slate-50">
        {body}
      </Link>
    </li>
  );
}

/** Menú completo del móvil. */
export function MobileMenu({ user, onClose }: { user: TradingProfile; onClose: () => void }) {
  const name = user.name ?? "Usuario";
  const groups: { title: string; items: Item[] }[] = [
    {
      title: "Cuenta",
      items: [
        { label: "Conexiones", icon: Plug, href: "/trading/integraciones" },
        { label: "Configuración de la cuenta", icon: UserCog, soon: true },
      ],
    },
    { title: "Recompensas", items: [{ label: "Invitar a amigos", icon: Gift, soon: true }] },
    {
      title: "Ayuda y asistencia",
      items: [
        { label: "Ayuda", icon: LifeBuoy, soon: true },
        { label: "Ir a Mis finanzas", icon: PiggyBank, href: "/finanzas/inicio" },
        ...(user.canAccessBusiness ? [{ label: "Ir a Mi negocio", icon: ArrowLeft, href: "/dashboard" }] : []),
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
          {user.image ? (
            <Image src={user.image} alt="" width={64} height={64} className="h-16 w-16 rounded-full object-cover" />
          ) : (
            <UserCircle className="h-16 w-16 text-slate-300" aria-hidden="true" />
          )}
          <span className="text-center text-xl font-semibold text-slate-900">{name}</span>
          {user.email && <span className="text-sm text-slate-400">{user.email}</span>}
        </div>
        {groups.map((g) => (
          <section key={g.title} className="pt-6">
            <h2 className="px-5 pb-1 text-[15px] font-medium text-slate-400">{g.title}</h2>
            <ul>
              {g.items.map((i) => (
                <MenuRow key={i.label} item={i} onNavigate={onClose} />
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

const THRESHOLD = 70;
const MAX_PULL = 110;

/** ¿Hay algo desplazado entre el dedo y el contenedor? Entonces el gesto es para eso, no para actualizar. */
function innerScrolled(target: EventTarget | null, root: HTMLElement) {
  let el = target as HTMLElement | null;
  while (el && el !== root) {
    if (el.scrollTop > 0) return true;
    el = el.parentElement;
  }
  return false;
}

/**
 * Arrastrar para actualizar (solo pantallas táctiles estrechas): desde arriba del todo del contenedor,
 * tirar hacia abajo estira el contenido con resistencia; al soltar pasado el umbral, avisa a todas las
 * pantallas de Trading de que recarguen (las mismas que escuchan el botón de actualizar).
 */
export function PullToRefresh({ scroller, children, onRefresh = refreshTrading }: { scroller: RefObject<HTMLElement | null>; children: ReactNode; onRefresh?: () => void }) {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const state = useRef<{ y: number; active: boolean; pull: number }>({ y: 0, active: false, pull: 0 });

  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const narrow = () => window.matchMedia("(max-width: 767px)").matches;
    const start = (e: TouchEvent) => {
      if (busy || !narrow() || root.scrollTop > 0 || innerScrolled(e.target, root) || e.touches.length !== 1) return;
      state.current = { y: e.touches[0].clientY, active: true, pull: 0 };
    };
    const move = (e: TouchEvent) => {
      const s = state.current;
      if (!s.active) return;
      const dy = e.touches[0].clientY - s.y;
      if (dy <= 0 || root.scrollTop > 0) {
        if (s.pull) setPull(0);
        s.pull = 0;
        if (dy < 0) s.active = false;
        return;
      }
      e.preventDefault();
      // Resistencia: cuanto más se tira, menos se mueve (efecto muelle).
      s.pull = Math.min(MAX_PULL, dy * 0.45);
      setPull(s.pull);
    };
    const end = () => {
      const s = state.current;
      if (!s.active) return;
      s.active = false;
      if (s.pull >= THRESHOLD) {
        setBusy(true);
        setPull(THRESHOLD * 0.75);
        onRefresh();
        window.setTimeout(() => {
          setBusy(false);
          setPull(0);
        }, 1200);
      } else {
        setPull(0);
      }
      s.pull = 0;
    };
    root.addEventListener("touchstart", start, { passive: true });
    root.addEventListener("touchmove", move, { passive: false });
    root.addEventListener("touchend", end);
    root.addEventListener("touchcancel", end);
    return () => {
      root.removeEventListener("touchstart", start);
      root.removeEventListener("touchmove", move);
      root.removeEventListener("touchend", end);
      root.removeEventListener("touchcancel", end);
    };
  }, [scroller, busy, onRefresh]);

  const dragging = state.current.active;
  const ready = pull >= THRESHOLD || busy;
  return (
    <>
      <div
        aria-hidden={!busy}
        className="pointer-events-none flex justify-center overflow-hidden md:hidden"
        style={{ height: pull, transition: dragging ? "none" : "height 0.3s cubic-bezier(.2,.9,.3,1.3)" }}
      >
        <span
          className={`mt-2 flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-md ring-1 ring-slate-100 ${ready ? "text-blue-600" : "text-slate-400"}`}
          style={{ opacity: Math.min(1, pull / 40) }}
        >
          <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} style={busy ? undefined : { transform: `rotate(${(pull / THRESHOLD) * 270}deg)` }} />
        </span>
      </div>
      {busy && <span className="sr-only" role="status">Actualizando</span>}
      {children}
    </>
  );
}
