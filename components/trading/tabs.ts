// components/trading/tabs.ts
// Secciones del módulo de trading (panel lateral y rutas /trading/<clave>).
import type { ComponentType } from "react";
import { Bot, Flame, Home, LineChart, Plug, Wallet } from "lucide-react";

export const TRADING_TAB_KEYS = ["inicio", "oportunidades", "agentes", "cartera", "mercados", "integraciones"] as const;
export type TradingTab = (typeof TRADING_TAB_KEYS)[number];
type TabDef = { key: TradingTab; label: string; icon: ComponentType<{ className?: string }>; description: string };

export const TRADING_SECTIONS: { title: string | null; items: TabDef[] }[] = [
  {
    title: null,
    items: [
      { key: "inicio", label: "Inicio", icon: Home, description: "Cómo vas frente a los agentes y lo que ha ido haciendo cada uno." },
      { key: "oportunidades", label: "Oportunidades", icon: Flame, description: "Ideas de compra en cripto al momento, qué habría pasado siguiéndolas y quién entró. Tú decides qué ejecutar." },
      { key: "agentes", label: "Agentes", icon: Bot, description: "Tres gestores de IA con su propia cartera que deciden y operan solos." },
      { key: "cartera", label: "Mi cartera", icon: Wallet, description: "Tu dinero real, los agentes que trabajan para ti y sus resultados." },
      { key: "mercados", label: "Mercados", icon: LineChart, description: "Valores seguidos y gráficos con figuras, noticias y aprendizaje." },
    ],
  },
  {
    title: "Ajustes",
    items: [
      { key: "integraciones", label: "Integraciones", icon: Plug, description: "Tus brókeres conectados: cuentas, entorno demo o real, permisos y registro de órdenes." },
    ],
  },
];

export const TRADING_TABS: TabDef[] = TRADING_SECTIONS.flatMap((s) => s.items);
export const isTradingTab = (v: string): v is TradingTab => (TRADING_TAB_KEYS as readonly string[]).includes(v);

/** Secciones cuyo contenido se desplaza internamente para mantener visibles las pestañas. */
export const FITTED_TABS: readonly TradingTab[] = ["inicio", "oportunidades", "agentes", "mercados"];
export const isFittedTab = (tab: string) => (FITTED_TABS as readonly string[]).includes(tab);
