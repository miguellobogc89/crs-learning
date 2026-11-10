// components/trading/tabs.ts
// Secciones del módulo de trading (panel lateral y rutas /trading/<clave>).
import type { ComponentType } from "react";
import { BookOpen, Flame, FlaskConical, History, Home, LineChart, ListChecks, Newspaper, SlidersHorizontal, Wallet } from "lucide-react";

export const TRADING_TAB_KEYS = ["inicio", "oportunidades", "cartera", "noticias", "simulador", "mercado", "patrones", "comite", "reglas", "valores"] as const;
export type TradingTab = (typeof TRADING_TAB_KEYS)[number];
type TabDef = { key: TradingTab; label: string; icon: ComponentType<{ className?: string }>; description: string };

export const TRADING_SECTIONS: { title: string | null; items: TabDef[] }[] = [
  {
    title: null,
    items: [
      { key: "inicio", label: "Inicio", icon: Home, description: "Tu dinero, las mejores oportunidades de hoy y lo más importante de las noticias, de un vistazo." },
      { key: "oportunidades", label: "Oportunidades", icon: Flame, description: "Lo que propone el comité de inversión para la próxima sesión, explicado, y las señales técnicas de las figuras." },
      { key: "cartera", label: "Mi cartera", icon: Wallet, description: "Tu dinero virtual: posiciones abiertas, órdenes pendientes, resultados y evolución." },
      { key: "noticias", label: "Noticias", icon: Newspaper, description: "Lo que se publica sobre tus valores y las criptomonedas, resumido y clasificado por la IA." },
      { key: "simulador", label: "Simulador", icon: FlaskConical, description: "¿Cuánto habrías ganado siguiendo la app? Elige mercado, periodo y perfil de riesgo." },
      { key: "mercado", label: "Gráficos", icon: LineChart, description: "Cada valor del IBEX 35 y cada criptomoneda con sus figuras dibujadas sobre el gráfico." },
      { key: "patrones", label: "Aprende", icon: BookOpen, description: "Qué es cada figura, cómo se opera y qué tal ha funcionado en la bolsa española y en crypto." },
    ],
  },
  {
    title: "Más",
    items: [
      { key: "comite", label: "Historial del comité", icon: History, description: "Todo lo que ha propuesto el comité y qué tal habría salido, comparado con el mercado." },
      { key: "reglas", label: "Reglas y riesgo", icon: SlidersHorizontal, description: "Cuánto arriesgar, qué señales aceptar y el modo automático." },
      { key: "valores", label: "Valores seguidos", icon: ListChecks, description: "Qué empresas y criptomonedas analiza la app." },
    ],
  },
];

export const TRADING_TABS: TabDef[] = TRADING_SECTIONS.flatMap((s) => s.items);
export const isTradingTab = (v: string): v is TradingTab => (TRADING_TAB_KEYS as readonly string[]).includes(v);
