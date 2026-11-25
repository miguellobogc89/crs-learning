"use client";
// Piezas de un movimiento compartidas por Movimientos y por otras pantallas que listan movimientos (p. ej. el
// detalle de una categoría en Plan): tipos, la fila del móvil y utilidades. La edición está en movement-detail.tsx.
// Una sola versión: lo que mejore aquí mejora en todas partes.
import type { listTransactions } from "@/lib/finance/service";
import { SELECTABLE_CATEGORIES, KIND_LABEL, categoryOf, type Kind } from "@/lib/finance/categories";
import { eur } from "@/components/trading/format";
import { Pill } from "@/components/trading/ui";
import { shortDay } from "./api";
import { CategoryIcon } from "./category-icon";

export type List = Awaited<ReturnType<typeof listTransactions>>;
export type Item = List["items"][number];

export const SOURCE_LABEL: Record<string, string> = {
  usuario: "Corregido por ti",
  regla: "Por una regla tuya",
  interna: "Detectado entre tus cuentas",
  palabra: "Por el comercio",
  ia: "Clasificado por la IA",
  auto: "Sin entender: revísalo",
  pendiente: "Pendiente",
};

const KIND_COLOR: Record<Kind, string> = { gasto: "slate", ingreso: "emerald", regalo: "violet", devolucion: "teal", interna: "blue", ahorro: "amber", prestamo: "orange" };

export function CategoryPill({ t }: { t: Pick<Item, "category" | "kind"> }) {
  const c = categoryOf(t.category);
  return <Pill color={t.kind === "gasto" ? c.color : KIND_COLOR[t.kind]}>{t.kind === "gasto" || t.kind === "devolucion" ? c.label : KIND_LABEL[t.kind]}</Pill>;
}

export function Amount({ t }: { t: Item }) {
  const muted = t.kind === "interna";
  return <span className={`amount whitespace-nowrap font-semibold tabular-nums ${muted ? "text-slate-400" : t.amount > 0 ? "text-emerald-700" : "text-slate-900"}`}>{t.amount > 0 ? "+" : ""}{eur(t.amount, 2)}</span>;
}

export const isReview = (t: Item) => t.source === "auto" || t.source === "pendiente";
export const label = (t: Item) => t.alias || t.counterparty || t.description;

/** Categorías que encajan con un tipo (un gasto o una devolución usan las de gasto). */
export const categoriesFor = (kind: Kind) =>
  SELECTABLE_CATEGORIES.filter((c) => (kind === "gasto" || kind === "devolucion" ? c.kind === "gasto" : c.kind === kind));

/**
 * Fila de un movimiento en el móvil: icono de color de su categoría, nombre (con un punto azul si está por revisar),
 * debajo la categoría y la fecha, y el importe a la derecha. Al tocarla se abre su detalle.
 */
export function MovementRowButton({ t, onClick }: { t: Item; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center gap-3 text-left active:opacity-70">
      <CategoryIcon category={t.kind === "interna" ? "transferencia_interna" : t.category} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          {isReview(t) && <span className="h-2 w-2 shrink-0 rounded-full bg-blue-600" aria-label="Por revisar" />}
          <span className="truncate text-[15px] font-medium text-slate-900">{label(t)}</span>
        </span>
        <span className="mt-0.5 block truncate text-xs text-slate-500">
          {t.kind === "gasto" || t.kind === "devolucion" ? categoryOf(t.category).label : KIND_LABEL[t.kind]}{t.subcategory ? ` · ${t.subcategory}` : ""} · {shortDay(t.date)}
          {t.extraordinary && <span className="text-amber-700"> · Extraordinario</span>}
          {t.imputedDate && t.imputedDate.slice(0, 7) !== t.date.slice(0, 7) && (
            <span className="text-blue-700"> → {new Date(`${t.imputedDate}T00:00:00Z`).toLocaleDateString("es-ES", { month: "short", year: "numeric", timeZone: "UTC" })}</span>
          )}
        </span>
      </span>
      <Amount t={t} />
    </button>
  );
}
