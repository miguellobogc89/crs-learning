// components/trading/tabs.ts
// Secciones del módulo de trading (panel lateral y rutas /trading/<clave>).
import type { ComponentType } from "react";
import { BookOpen, Bot, Flame, Home, LineChart, ListChecks, Newspaper, Plug, SlidersHorizontal, Wallet } from "lucide-react";

export const TRADING_TAB_KEYS = ["inicio", "oportunidades", "agentes", "cartera", "mercado", "noticias", "patrones", "reglas", "valores", "integraciones"] as const;
export type TradingTab = (typeof TRADING_TAB_KEYS)[number];
type TabDef = { key: TradingTab; label: string; icon: ComponentType<{ className?: string }>; description: string };

export const TRADING_SECTIONS: { title: string | null; items: TabDef[] }[] = [
  {
    title: null,
    items: [
      { key: "inicio", label: "Inicio", icon: Home, description: "Cómo vas frente a los agentes y lo que ha ido haciendo cada uno." },
      { key: "oportunidades", label: "Oportunidades", icon: Flame, description: "Ideas de compra en cripto al momento, qué habría pasado siguiéndolas y quién entró. Tú decides qué ejecutar." },
      { key: "agentes", label: "Agentes", icon: Bot, description: "Tres gestores de IA con su propia cartera que deciden y operan solos." },
      { key: "cartera", label: "Mi cartera", icon: Wallet, description: "Tu dinero virtual: posiciones abiertas, órdenes pendientes, resultados y evolución." },
    ],
  },
  {
    title: "Explorar",
    items: [
      { key: "mercado", label: "Gráficos", icon: LineChart, description: "Cada valor del IBEX 35 y cada criptomoneda con sus figuras dibujadas sobre el gráfico." },
      { key: "noticias", label: "Noticias", icon: Newspaper, description: "Lo que se publica sobre tus valores y las criptomonedas, resumido y clasificado por la IA." },
      { key: "patrones", label: "Aprende", icon: BookOpen, description: "Qué es cada figura, cómo se opera y qué tal ha funcionado en la bolsa española y en crypto." },
    ],
  },
  {
    title: "Ajustes",
    items: [
      { key: "reglas", label: "Reglas y riesgo", icon: SlidersHorizontal, description: "Cuánto arriesgar en tu cartera y el modo automático." },
      { key: "valores", label: "Valores seguidos", icon: ListChecks, description: "Qué empresas y criptomonedas analiza la app." },
      { key: "integraciones", label: "Integraciones", icon: Plug, description: "Tus brókeres conectados: cuentas, entorno demo o real, permisos y registro de órdenes." },
    ],
  },
];

export const TRADING_TABS: TabDef[] = TRADING_SECTIONS.flatMap((s) => s.items);
export const isTradingTab = (v: string): v is TradingTab => (TRADING_TAB_KEYS as readonly string[]).includes(v);
