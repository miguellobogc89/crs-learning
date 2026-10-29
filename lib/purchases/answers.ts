import type { Decision } from "./rules";

/** A written answer to a purchase question (pure): a number, «no lo sé» or «saltar». */
export type Answer =
  | { tipo: "respuesta"; decision: Decision; texto: string }
  | { tipo: "no_lo_se"; decision: Decision; texto: string }
  | { tipo: "saltar"; texto: string }
  | { tipo: "no_entendido" };

/** «12», «fueron 12 cajas», «12,5», «1.234,50 €», «1.500» → number; null if there is none. */
export function readNumber(text: string): number | null {
  const m = /\d[\d.,]*/.exec(text);
  if (!m) return null;
  let raw = m[0].replace(/[.,]+$/, "");
  if (raw.includes(".") && raw.includes(",")) raw = raw.replace(/\./g, "").replace(",", ".");
  else if (raw.includes(",")) raw = raw.replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) raw = raw.replace(/\./g, "");
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function readAnswer(text: string, pide: "unidades" | "importe"): Answer {
  const t = text.trim().toLowerCase();
  if (/^(salta|saltar|siguiente|luego|despu[eé]s|otra|pasa)/.test(t)) return { tipo: "saltar", texto: "De acuerdo, esta te la pregunto más adelante." };
  if (/no (lo )?s[eé]|ni idea|no me acuerdo|no estoy segur/.test(t)) return { tipo: "no_lo_se", decision: { ignorar: true }, texto: "Vale, la dejo como viene en la factura." };
  const n = readNumber(t);
  if (n === null) return { tipo: "no_entendido" };
  return pide === "importe"
    ? { tipo: "respuesta", decision: { importe: n }, texto: `Anotado: ${n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €.` }
    : { tipo: "respuesta", decision: { unidades: n }, texto: `Anotado: ${n.toLocaleString("es-ES")}.` };
}
