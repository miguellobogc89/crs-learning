// components/trading/tabs.ts
// Secciones del módulo de trading (panel lateral y rutas /trading/<clave>).
import type { ComponentType } from "react";
import { BookOpen, CalendarCheck, FlaskConical, LineChart, ListChecks, SlidersHorizontal, Wallet } from "lucide-react";

export const TRADING_TAB_KEYS = ["hoy", "cartera", "simulador", "mercado", "patrones", "reglas", "valores"] as const;
export type TradingTab = (typeof TRADING_TAB_KEYS)[number];
type TabDef = { key: TradingTab; label: string; icon: ComponentType<{ className?: string }>; description: string };

export const TRADING_SECTIONS: { title: string | null; items: TabDef[] }[] = [
  {
    title: null,
    items: [
      { key: "hoy", label: "Qué hacer hoy", icon: CalendarCheck, description: "Las operaciones que propone la app para la próxima sesión, con cuánto entrar y dónde salir." },
      { key: "cartera", label: "Mi cartera", icon: Wallet, description: "Tu dinero virtual: posiciones abiertas, órdenes pendientes, resultados y evolución." },
      { key: "simulador", label: "¿Cómo me habría ido?", icon: FlaskConical, description: "Simula qué habría pasado si hubieras seguido la app desde hace unos meses, con tus mismas reglas." },
      { key: "mercado", label: "Gráficos", icon: LineChart, description: "Cada valor del IBEX 35 con sus figuras dibujadas sobre el gráfico." },
      { key: "patrones", label: "Aprende los patrones", icon: BookOpen, description: "Qué es cada figura, cómo se opera y qué tal ha funcionado en la bolsa española." },
    ],
  },
  {
    title: "Configuración",
    items: [
      { key: "reglas", label: "Reglas y riesgo", icon: SlidersHorizontal, description: "Cuánto arriesgar, qué señales aceptar y el modo automático." },
      { key: "valores", label: "Valores seguidos", icon: ListChecks, description: "Qué empresas analiza la app." },
    ],
  },
];

export const TRADING_TABS: TabDef[] = TRADING_SECTIONS.flatMap((s) => s.items);
export const isTradingTab = (v: string): v is TradingTab => (TRADING_TAB_KEYS as readonly string[]).includes(v);
