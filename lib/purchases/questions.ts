import type { Line, Normalized } from "./rules";

/**
 * The questions the person is asked about their purchases (pure). Written for someone who runs a shop, not for
 * someone who knows tables: what the invoice says, in their words, and a few likely answers to tap.
 */
export type Question = {
  lineId: string;
  /** What is asked: how many units were bought, or what was paid. */
  pide: "unidades" | "importe";
  titulo: string;
  detalle: string;
  /** Likely answers (tap to choose). */
  opciones: { etiqueta: string; valor: number }[];
  documento: string | null;
  /** How much money the line moves (most important first). */
  peso: number;
};

const money = (n: number) => `${n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const qty = (n: number) => n.toLocaleString("es-ES", { maximumFractionDigits: 3 });
const date = (d: string | null) => d && /^\d{4}-\d{2}-\d{2}/.test(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : null;
const unitWord = (l: Line) => {
  const t = (l.producto ?? "").toLowerCase();
  return /\b(cj|caja|cajas)\b/.test(t) ? "cajas" : /\b(s\/|saco)/.test(t) ? "sacos" : /\b(b\/|bolsa|box)/.test(t) ? "envases" : /\b(bt|botella)/.test(t) ? "botellas" : "unidades";
};

export function buildQuestions(lines: Line[], normalized: Map<string, Normalized>): Question[] {
  const out: Question[] = [];
  for (const l of lines) {
    const n = normalized.get(l.id);
    if (n?.estado !== "pregunta") continue;
    const where = [l.proveedor && `de ${l.proveedor}`, date(l.fecha) && `del ${date(l.fecha)}`].filter(Boolean).join(" ");
    const producto = l.producto ?? "un producto";
    if (n.falta === "importe" || n.falta === "las_cifras") {
      out.push({ lineId: l.id, pide: "importe", titulo: `¿Cuánto pagaste por «${producto}»?`,
        detalle: `En la factura ${where} no se pudo leer el importe de esta línea${l.cantidad ? ` (${qty(l.cantidad)} ${unitWord(l)})` : ""}.`,
        opciones: [], documento: l.documento, peso: (l.cantidad ?? 1) * (l.precio ?? 0) });
      continue;
    }
    const words = unitWord(l);
    // Likely answers: what the amount gives at the price read, and at the price per kilo/litre times the content.
    const options = new Map<number, string>();
    const add = (v: number | null, label: (v: number) => string) => { if (v !== null && Number.isFinite(v) && v > 0 && !options.has(v)) options.set(v, label(v)); };
    if (l.importe && l.precio) {
      const a = Math.round(l.importe / l.precio * 1000) / 1000;
      if (Math.abs(a - Math.round(a)) < 0.05) add(Math.round(a), v => `${qty(v)} ${words}`);
      if (l.envase) { const b = Math.round(l.importe / (l.precio * l.envase) * 1000) / 1000; if (Math.abs(b - Math.round(b)) < 0.05) add(Math.round(b), v => `${qty(v)} ${words}`); }
    }
    if (l.cantidad) add(l.cantidad, v => `${qty(v)} ${words} (lo que pone)`);
    out.push({ lineId: l.id, pide: "unidades", titulo: `¿Cuántas ${words} de «${producto}» compraste?`,
      detalle: `En la factura ${where} pone ${l.cantidad !== null ? qty(l.cantidad) : "?"} a ${l.precio !== null ? money(l.precio) : "?"}${l.descuento ? ` con ${qty(l.descuento)} de descuento` : ""}, pero la línea suma ${l.importe !== null ? money(l.importe) : "?"}, y no cuadra.`,
      opciones: [...options].map(([valor, etiqueta]) => ({ etiqueta, valor })).slice(0, 3), documento: l.documento, peso: l.importe ?? 0 });
  }
  return out.sort((a, b) => b.peso - a.peso);
}
