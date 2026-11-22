// components/finance/tabs.ts
// Secciones de CRS Finance (panel lateral y rutas /finanzas/<clave>).
import type { ComponentType } from "react";
import { FileText, FlaskConical, Home, Landmark, ListOrdered, MessageCircle, PiggyBank, Plug, Settings2, SlidersHorizontal } from "lucide-react";

export const FINANCE_TAB_KEYS = ["inicio", "movimientos", "plan", "copiloto", "documentos", "configurar", "cuentas", "conexiones", "ajustes", "laboratorio"] as const;
export type FinanceTab = (typeof FINANCE_TAB_KEYS)[number];
type TabDef = { key: FinanceTab; label: string; icon: ComponentType<{ className?: string; strokeWidth?: number }>; description: string };

export const FINANCE_SECTIONS: { title: string | null; items: TabDef[] }[] = [
  {
    title: null,
    items: [
      { key: "inicio", label: "Inicio", icon: Home, description: "Cómo vas este ciclo, la previsión y los avisos." },
      { key: "movimientos", label: "Movimientos", icon: ListOrdered, description: "Todos tus movimientos, entendidos y categorizados." },
      { key: "plan", label: "Plan", icon: PiggyBank, description: "Cómo vas este ciclo con tus paquetes y tu ahorro." },
      { key: "copiloto", label: "Copiloto", icon: MessageCircle, description: "Pregunta lo que quieras sobre tu dinero." },
      { key: "documentos", label: "Documentos", icon: FileText, description: "Tus nóminas y sus conceptos, con todo el histórico." },
    ],
  },
  {
    title: "Ajustes",
    items: [
      { key: "configurar", label: "Configurar mi plan", icon: SlidersHorizontal, description: "Tus paquetes, sus cargos y objetivos, y tu objetivo de ahorro." },
      { key: "cuentas", label: "Cuentas", icon: Landmark, description: "Saldos, cuentas bancarias y conexión con bancos." },
      { key: "conexiones", label: "Conexiones", icon: Plug, description: "Integraciones con servicios externos como Gmail." },
      { key: "ajustes", label: "Preferencias", icon: Settings2, description: "Ciclo económico, reglas aprendidas y lo que recuerda el copiloto." },
    ],
  },
];

export const FINANCE_TABS: TabDef[] = FINANCE_SECTIONS.flatMap((s) => s.items);

/** Secciones que existen pero no salen en ningún menú (se entra por la dirección). */
export const HIDDEN_TABS: TabDef[] = [
  { key: "laboratorio", label: "Laboratorio", icon: FlaskConical, description: "Pantalla de pruebas de Plan con tus datos reales, solo lectura." },
];
export const tabDefOf = (key: string) => FINANCE_TABS.find((t) => t.key === key) ?? HIDDEN_TABS.find((t) => t.key === key) ?? FINANCE_TABS[0];
export const isFinanceTab = (v: string): v is FinanceTab => (FINANCE_TAB_KEYS as readonly string[]).includes(v);

/** Secciones cuyo contenido ocupa la pantalla y desplaza por dentro (tablas y chat). */
export const FITTED_TABS: readonly FinanceTab[] = ["movimientos", "copiloto"];
export const isFittedTab = (tab: string) => (FITTED_TABS as readonly string[]).includes(tab);

/** Barra inferior del móvil. */
export const BOTTOM_TABS: FinanceTab[] = ["inicio", "movimientos", "plan", "copiloto", "documentos"];

/** Direcciones antiguas que ahora viven en otra sección. */
export const LEGACY_TABS: Record<string, FinanceTab> = { presupuesto: "plan", prevision: "plan" };
