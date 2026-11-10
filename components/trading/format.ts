// components/trading/format.ts
import type { PatternKey } from "@/lib/trading/types";

export const eur = (v: number | null | undefined, digits?: number) =>
  v === null || v === undefined || !Number.isFinite(v)
    ? "—"
    : new Intl.NumberFormat("es-ES", {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: digits ?? (Math.abs(v) < 20 ? 3 : 2),
        maximumFractionDigits: digits ?? (Math.abs(v) < 20 ? 3 : 2),
      }).format(v);

export const eur0 = (v: number | null | undefined) => eur(v, 0);

export const num = (v: number | null | undefined, digits = 2) =>
  v === null || v === undefined || !Number.isFinite(v)
    ? "—"
    : new Intl.NumberFormat("es-ES", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);

export const pct = (v: number | null | undefined, digits = 1, sign = true) =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : `${sign && v > 0 ? "+" : ""}${num(v, digits)} %`;

/** Enteros y cantidades (las de crypto llevan decimales). */
export const int = (v: number) =>
  new Intl.NumberFormat("es-ES", { maximumFractionDigits: Number.isInteger(v) ? 0 : Math.abs(v) < 1 ? 6 : Math.abs(v) < 100 ? 4 : 2 }).format(v);

export const dayFmt = (d: string | null | undefined) =>
  d ? new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(d)) : "—";

export const tone = (v: number | null | undefined) =>
  v === null || v === undefined || v === 0 ? "text-slate-700" : v > 0 ? "text-emerald-700" : "text-red-700";

export function errorText(e: unknown) {
  return e instanceof Error ? e.message : "No se pudo completar la operación";
}

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/trading/${path}`, {
    method: body === undefined ? "GET" : "POST",
    cache: "no-store",
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "No se pudo completar la operación");
  return data as T;
}

export const field =
  "border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100";
export const ghost =
  "inline-flex items-center gap-1.5 border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50";
export const primary =
  "inline-flex items-center gap-1.5 bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50";
export const panel = "border border-slate-200 bg-white";
export const th = "px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500";

export const DIRECTION_LABEL = { long: "Alcista", short: "Bajista" } as const;

export const ACTION_LABEL: Record<string, string> = {
  comprar: "Comprar",
  vender_corto: "Vender en corto",
  evitar: "Evitar / vender",
  vigilar: "Vigilar",
  cerrar: "Cerrar posición",
};
export const ACTION_TONE: Record<string, string> = {
  comprar: "bg-emerald-50 text-emerald-800 border-emerald-200",
  vender_corto: "bg-red-50 text-red-700 border-red-200",
  evitar: "bg-amber-50 text-amber-800 border-amber-200",
  vigilar: "bg-slate-50 text-slate-700 border-slate-200",
  cerrar: "bg-red-50 text-red-700 border-red-200",
};

export const PATTERN_SHORT: Record<PatternKey, string> = {
  hch: "HCH",
  hch_inv: "HCH invertido",
  double_top: "Doble techo",
  double_bottom: "Doble suelo",
  triangle_asc: "Triángulo asc.",
  triangle_desc: "Triángulo desc.",
  triangle_sym: "Triángulo sim.",
  flag_bull: "Bandera alcista",
  flag_bear: "Bandera bajista",
  range_up: "Rango ↑",
  range_down: "Rango ↓",
};

export const STATUS_LABEL: Record<string, string> = {
  forming: "Pendiente de ruptura",
  confirmed: "Ruptura confirmada",
  invalidated: "Anulada",
  expired: "Caducada",
};
