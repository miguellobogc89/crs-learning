// lib/finance/categories.ts
// Categorías y «significado económico» (kind) de CRS Finance. Sin dependencias: lo usan servidor y cliente.

/**
 * Significado económico de un movimiento:
 * - gasto: dinero que sale de verdad (cuenta para el gasto y el presupuesto).
 * - ingreso: ingreso ordinario (nómina, intereses…).
 * - regalo: dinero recibido que no es un ingreso ordinario (se muestra aparte y no se proyecta).
 * - devolucion: reembolso de un gasto; resta del gasto de su categoría.
 * - interna: entre cuentas propias (recarga de Revolut, traspaso para la hipoteca…). No es gasto ni ingreso.
 * - ahorro: aportación a ahorro o inversión (bróker, exchange, fondo). Es ahorro, no gasto.
 */
export const KINDS = ["gasto", "ingreso", "regalo", "devolucion", "interna", "ahorro"] as const;
export type Kind = (typeof KINDS)[number];

export const KIND_LABEL: Record<Kind, string> = {
  gasto: "Gasto",
  ingreso: "Ingreso",
  regalo: "Regalo recibido",
  devolucion: "Devolución",
  interna: "Entre mis cuentas",
  ahorro: "Ahorro / inversión",
};

export type CategoryDef = { key: string; label: string; kind: Kind; color: string };

/** Paleta: tonos de Tailwind para pastillas y gráficos (mismo criterio de color que Trading). */
export const CATEGORIES: CategoryDef[] = [
  { key: "vivienda", label: "Vivienda", kind: "gasto", color: "blue" },
  { key: "suministros", label: "Suministros", kind: "gasto", color: "teal" },
  { key: "alimentacion", label: "Alimentación", kind: "gasto", color: "emerald" },
  { key: "restaurantes", label: "Restaurantes", kind: "gasto", color: "orange" },
  { key: "ocio", label: "Ocio", kind: "gasto", color: "violet" },
  { key: "videojuegos", label: "Videojuegos", kind: "gasto", color: "purple" },
  { key: "transporte", label: "Transporte", kind: "gasto", color: "amber" },
  { key: "compras", label: "Compras", kind: "gasto", color: "rose" },
  { key: "suscripciones", label: "Suscripciones", kind: "gasto", color: "fuchsia" },
  { key: "salud", label: "Salud", kind: "gasto", color: "lime" },
  { key: "seguros", label: "Seguros", kind: "gasto", color: "slate" },
  { key: "prestamos", label: "Préstamos", kind: "gasto", color: "red" },
  { key: "impuestos", label: "Impuestos", kind: "gasto", color: "stone" },
  { key: "educacion", label: "Educación", kind: "gasto", color: "indigo" },
  { key: "viajes", label: "Viajes", kind: "gasto", color: "sky" },
  { key: "cuidado_personal", label: "Cuidado personal", kind: "gasto", color: "pink" },
  { key: "regalos", label: "Regalos y donaciones", kind: "gasto", color: "purple" },
  { key: "efectivo", label: "Efectivo", kind: "gasto", color: "zinc" },
  { key: "comisiones", label: "Comisiones", kind: "gasto", color: "neutral" },
  { key: "otros_gastos", label: "Otros gastos", kind: "gasto", color: "gray" },
  { key: "nomina", label: "Nómina", kind: "ingreso", color: "emerald" },
  { key: "intereses", label: "Intereses y rendimientos", kind: "ingreso", color: "teal" },
  { key: "otros_ingresos", label: "Otros ingresos", kind: "ingreso", color: "cyan" },
  { key: "regalo_recibido", label: "Regalo recibido", kind: "regalo", color: "purple" },
  { key: "transferencia_interna", label: "Entre mis cuentas", kind: "interna", color: "slate" },
  { key: "ahorro_inversion", label: "Ahorro e inversión", kind: "ahorro", color: "indigo" },
  { key: "sin_clasificar", label: "Sin clasificar", kind: "gasto", color: "gray" },
];

const BY_KEY = new Map(CATEGORIES.map((c) => [c.key, c]));
export const categoryOf = (key: string): CategoryDef => BY_KEY.get(key) ?? BY_KEY.get("otros_gastos")!;
export const categoryLabel = (key: string) => categoryOf(key).label;
export const isCategory = (key: unknown): key is string => typeof key === "string" && BY_KEY.has(key);
export const isKind = (v: unknown): v is Kind => typeof v === "string" && (KINDS as readonly string[]).includes(v);

/** Opciones compartidas por los selectores de categorías, siempre en orden alfabético. */
export const SELECTABLE_CATEGORIES = CATEGORIES.filter((c) => c.key !== "sin_clasificar")
  .sort((a, b) => a.label.localeCompare(b.label, "es", { sensitivity: "base" }));

/** Categorías de gasto (para presupuestos y devoluciones). */
export const EXPENSE_CATEGORIES = SELECTABLE_CATEGORIES.filter((c) => c.kind === "gasto");

/** Color HEX de cada tono, para los gráficos SVG. */
export const HEX: Record<string, string> = {
  blue: "#3b82f6", teal: "#14b8a6", emerald: "#10b981", orange: "#f97316", violet: "#8b5cf6", amber: "#f59e0b",
  rose: "#f43f5e", fuchsia: "#d946ef", lime: "#84cc16", slate: "#64748b", red: "#ef4444", stone: "#78716c",
  indigo: "#6366f1", sky: "#0ea5e9", pink: "#ec4899", purple: "#a855f7", zinc: "#71717a", neutral: "#737373",
  gray: "#9ca3af", cyan: "#06b6d4",
};
export const categoryHex = (key: string) => HEX[categoryOf(key).color] ?? HEX.gray;
