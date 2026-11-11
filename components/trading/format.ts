// components/trading/format.ts
import type { PatternKey } from "@/lib/trading/types";

// Formato de cifras: punto de miles y coma decimal siempre (de-DE agrupa también los miles de 4
// cifras, que es-ES deja sin punto). Importes con dos decimales; precios por debajo de 1 € con cuatro
// para que no se pierda la diferencia entre stop y objetivo en monedas baratas.
const nf = (digits: number) => new Intl.NumberFormat("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const eurDigits = (v: number) => (v !== 0 && Math.abs(v) < 1 ? 4 : 2);

export const eur = (v: number | null | undefined, digits?: number) =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : `${nf(digits ?? eurDigits(v)).format(v)} €`;

/** Importes (saldos, resultados): siempre dos decimales. */
export const eur0 = (v: number | null | undefined) => eur(v, 2);

export const num = (v: number | null | undefined, digits = 2) =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : nf(digits).format(v);

export const pct = (v: number | null | undefined, digits = 1, sign = true) =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : `${sign && v > 0 ? "+" : ""}${num(v, digits)} %`;

/** Enteros y cantidades (las de crypto llevan decimales). */
export const int = (v: number) =>
  new Intl.NumberFormat("de-DE", { maximumFractionDigits: Number.isInteger(v) ? 0 : Math.abs(v) < 1 ? 6 : Math.abs(v) < 100 ? 4 : 2 }).format(v);

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

// Estilo común del módulo (el de Inicio): tarjetas redondeadas con sombra suave, botones y campos redondeados.
export const field =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100";
export const ghost =
  "inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50";
export const primary =
  "inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-600/30 hover:bg-blue-700 disabled:opacity-50 disabled:shadow-none";
/** Tarjeta de Inicio. */
export const card = "rounded-2xl border border-slate-100 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.04)]";
/** Tarjeta con contenido a sangre (tablas, listas con separadores). */
export const panel = `${card} overflow-hidden`;
export const th = "px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";

/** Cuándo se reúnen los agentes (por defecto; el servidor puede cambiarlo). */
export const MEETINGS_TEXT = "Se reúnen cada hora con la bolsa abierta y cada 4 horas fuera de ella; con el mercado abierto compran al momento.";

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

/** Etiqueta de lo que hizo entrar una operación simulada: una figura o la estrategia de tendencia. */
export const signalLabel = (p: string) => (p === "tendencia" ? "Tendencia" : PATTERN_SHORT[p as PatternKey] ?? p);

/** Alto de una página del módulo sin scroll: la tabla ocupa el resto y desplaza por dentro. */
/** Alto de las tablas a pantalla completa (en móvil, menos: arriba están las pestañas de secciones). */
export const FULL_H = "h-[calc(100dvh-13rem)] lg:h-[calc(100dvh-10rem)]";
