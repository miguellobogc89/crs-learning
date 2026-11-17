// lib/finance/import.ts
// Importar extractos (CSV, Excel o PDF) a una cuenta: para el historial que el banco ya no da por la API o
// para cuentas sin conexión. Las tablas se leen por columnas (fecha, concepto, importe o cargo/abono); si no
// se reconocen las columnas, o en los PDF, la IA extrae los movimientos. Nunca se duplica lo que ya está.
import "server-only";
import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import { extractText } from "unpdf";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { aiAvailable, financeJson } from "./ai";
import { classifyPending } from "./classify";
import { normalize } from "./logic";
import { detectColumns, parseDate, rowsFromTable, type ParsedRow } from "./parse";


const MAX_BYTES = 4 * 1024 * 1024;

const AI_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["rows"],
  properties: {
    rows: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date", "description", "amount"],
        properties: { date: { type: "string" }, description: { type: "string" }, amount: { type: "number" } },
      },
    },
  },
};

async function aiExtract(text: string): Promise<ParsedRow[]> {
  if (!aiAvailable()) throw new Error("No se reconocieron las columnas del extracto y la IA no está configurada");
  const chunks: string[] = [];
  for (let i = 0; i < text.length && chunks.length < 8; i += 14_000) chunks.push(text.slice(i, i + 14_000));
  const out: ParsedRow[] = [];
  for (const chunk of chunks) {
    const res = await financeJson<{ rows: { date: string; description: string; amount: number }[] }>({
      tier: "fast",
      schemaName: "movimientos_extracto",
      instructions: [
        "Extraes los movimientos de un extracto bancario español. Devuelve cada movimiento una sola vez.",
        "date en formato AAAA-MM-DD (fecha de operación). amount negativo si sale dinero (cargo), positivo si entra (abono).",
        "Ignora saldos, totales, cabeceras, publicidad y líneas que no sean movimientos. No inventes nada.",
      ].join("\n"),
      input: chunk,
      schema: AI_SCHEMA,
      maxOutputTokens: 12000,
      timeoutMs: 90_000,
    });
    for (const r of res.rows ?? []) {
      const date = parseDate(r.date);
      if (date && Number.isFinite(r.amount) && r.amount !== 0) out.push({ date, description: r.description.slice(0, 500) || "Movimiento importado", amount: Math.round(r.amount * 100) / 100 });
    }
  }
  return out;
}

export async function parseStatement(file: { name: string; bytes: Buffer }): Promise<{ rows: ParsedRow[]; method: "tabla" | "ia" }> {
  if (file.bytes.length > MAX_BYTES) throw new Error("El archivo supera 4 MB");
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") {
    const { text } = await extractText(new Uint8Array(file.bytes), { mergePages: true });
    const plain = String(text ?? "").trim();
    if (plain.length < 40) throw new Error("El PDF no tiene texto (¿es una imagen escaneada?). Prueba con el CSV o Excel del banco.");
    return { rows: await aiExtract(plain), method: "ia" };
  }
  if (!["csv", "xlsx", "xls", "txt"].includes(ext)) throw new Error("Formato no admitido: usa CSV, Excel o PDF");
  const wb = ext === "csv" || ext === "txt" ? XLSX.read(file.bytes.toString("utf8"), { type: "string", raw: true }) : XLSX.read(file.bytes, { cellDates: false });
  const rows: unknown[][] = [];
  for (const name of wb.SheetNames.slice(0, 3)) rows.push(...XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: "" }));
  const found = detectColumns(rows);
  if (found) {
    const parsed = rowsFromTable(rows, found);
    if (parsed.length) return { rows: parsed, method: "tabla" };
  }
  const text = rows.slice(0, 1500).map((r) => r.map((c) => String(c ?? "")).join("\t")).join("\n");
  return { rows: await aiExtract(text), method: "ia" };
}

/**
 * Guarda los movimientos en la cuenta indicada (o en una nueva «importada»). Se salta lo que ya existe:
 * por huella del propio extracto y, si la cuenta está conectada al banco, por fecha e importe.
 */
export async function importStatement(userId: string, file: { name: string; bytes: Buffer }, target: { accountId?: string | null; newAccountName?: string | null }) {
  let accountId = target.accountId ?? null;
  if (accountId) {
    const acc = await prisma.finance_accounts.findFirst({ where: { id: accountId, user_id: userId } });
    if (!acc) throw new Error("Cuenta no encontrada");
  } else {
    const name = target.newAccountName?.trim().slice(0, 80);
    if (!name) throw new Error("Elige una cuenta o pon nombre a la nueva");
    const acc = await prisma.finance_accounts.create({ data: { user_id: userId, source: "import", name } });
    accountId = acc.id;
  }
  const { rows, method } = await parseStatement(file);
  if (!rows.length) throw new Error("No se encontraron movimientos en el archivo");

  // Lo que ya hay en la cuenta, por fecha e importe (multiconjunto: dos cafés iguales el mismo día son dos).
  const dates = rows.map((r) => r.date).sort();
  const existing = await prisma.finance_transactions.findMany({
    where: { account_id: accountId, booking_date: { gte: new Date(`${dates[0]}T00:00:00Z`), lte: new Date(`${dates[dates.length - 1]}T00:00:00Z`) } },
    select: { booking_date: true, amount: true, source: true },
  });
  const avail = new Map<string, number>();
  for (const e of existing) {
    const k = `${e.booking_date.toISOString().slice(0, 10)}|${Number(e.amount).toFixed(2)}`;
    avail.set(k, (avail.get(k) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  const data: Prisma.finance_transactionsCreateManyInput[] = [];
  let skipped = 0;
  for (const r of rows) {
    const k = `${r.date}|${r.amount.toFixed(2)}`;
    const left = avail.get(k) ?? 0;
    if (left > 0) {
      avail.set(k, left - 1);
      skipped++;
      continue;
    }
    const base = createHash("sha256").update(`${r.date}|${r.amount.toFixed(2)}|${normalize(r.description)}`).digest("hex").slice(0, 24);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    data.push({
      user_id: userId, account_id: accountId, external_id: `imp:${base}:${n}`, source: "import",
      booking_date: new Date(`${r.date}T00:00:00Z`), amount: r.amount, description: r.description,
    });
  }
  let inserted = 0;
  for (let i = 0; i < data.length; i += 500) inserted += (await prisma.finance_transactions.createMany({ data: data.slice(i, i + 500), skipDuplicates: true })).count;
  skipped += data.length - inserted;
  const classified = await classifyPending(userId, { useAi: false });
  return { accountId, method, found: rows.length, inserted, skipped, from: dates[0], to: dates[dates.length - 1], classified };
}
