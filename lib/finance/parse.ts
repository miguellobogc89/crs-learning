// lib/finance/parse.ts
// Lectura de extractos en tabla (CSV/Excel): importes y fechas en formato español y detección de columnas.
// Sin dependencias, para poder probarlo.
import { normalize } from "./logic";

export type ParsedRow = { date: string; description: string; amount: number };

/** «1.234,56», «-12,30 €», «1,234.56», «(45.00)» → número. */
export function parseAmount(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  let s = raw.replace(/[€\s]|EUR/gi, "").trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.endsWith("-")) { neg = true; s = s.slice(0, -1); }
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const v = Number(s);
  if (!Number.isFinite(v)) return null;
  return neg ? -Math.abs(v) : v;
}

/** «12/11/2026», «12-11-26», «2026-11-12», número de serie de Excel → "AAAA-MM-DD". */
export function parseDate(raw: unknown): string | null {
  if (typeof raw === "number" && raw > 20000 && raw < 80000) {
    // Número de serie de Excel: días desde el 30/12/1899.
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(raw) * 86_400_000).toISOString().slice(0, 10);
  }
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.toISOString().slice(0, 10);
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    const month = Number(m[2]);
    const day = Number(m[1]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return null;
}

const has = (h: string, words: string[]) => words.some((w) => h.includes(w));

type Columns = { date: number; desc: number[]; amount: number | null; debit: number | null; credit: number | null };

/** Reconoce la fila de cabecera y las columnas por su nombre (español o inglés). */
export function detectColumns(rows: unknown[][]): { header: number; cols: Columns } | null {
  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const h = rows[r].map((c) => normalize(String(c ?? "")));
    const dateCols = h.map((x, i) => (has(x, ["fecha", "date", "f. operacion", "f.operacion"]) ? i : -1)).filter((i) => i >= 0);
    if (!dateCols.length) continue;
    // Fecha de operación antes que fecha valor.
    const date = dateCols.find((i) => !h[i].includes("valor")) ?? dateCols[0];
    const desc = h.map((x, i) => (has(x, ["concepto", "descripcion", "detalle", "description", "movimiento", "beneficiario", "comercio", "referencia"]) && !has(x, ["fecha"]) ? i : -1)).filter((i) => i >= 0);
    const amount = h.findIndex((x) => has(x, ["importe", "amount", "cantidad", "monto"]) && !has(x, ["saldo", "balance"]));
    const debit = h.findIndex((x) => has(x, ["cargo", "debe", "debit", "salida", "gasto"]));
    const credit = h.findIndex((x) => has(x, ["abono", "haber", "credit", "entrada", "ingreso"]));
    if (!desc.length || (amount < 0 && (debit < 0 || credit < 0))) continue;
    return { header: r, cols: { date, desc, amount: amount >= 0 ? amount : null, debit: debit >= 0 ? debit : null, credit: credit >= 0 ? credit : null } };
  }
  return null;
}

export function rowsFromTable(rows: unknown[][], found: { header: number; cols: Columns }): ParsedRow[] {
  const out: ParsedRow[] = [];
  const { cols } = found;
  for (const row of rows.slice(found.header + 1)) {
    const date = parseDate(row[cols.date]);
    if (!date) continue;
    let amount: number | null = null;
    if (cols.amount !== null) amount = parseAmount(row[cols.amount]);
    else {
      const d = cols.debit !== null ? parseAmount(row[cols.debit]) : null;
      const c = cols.credit !== null ? parseAmount(row[cols.credit]) : null;
      if (d) amount = -Math.abs(d);
      else if (c) amount = Math.abs(c);
    }
    if (amount === null || amount === 0) continue;
    const description = cols.desc.map((i) => String(row[i] ?? "").trim()).filter(Boolean).join(" · ").slice(0, 500);
    out.push({ date, description: description || "Movimiento importado", amount });
  }
  return out;
}

