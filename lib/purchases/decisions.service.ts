import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { Decision } from "./rules";

/**
 * The person's answers about purchase lines (table purchase_line_reviews, script
 * scripts/neon/20261029_purchase_line_reviews.sql). Kept apart: what was read from the invoice is never changed.
 * Without the table (SQL not run yet) there are no answers and saving says so.
 */
type Model = {
  findMany(a: unknown): Promise<{ line_id: string; review_json: unknown }[]>;
  upsert(a: unknown): Promise<unknown>;
};
const model = () => (prisma as unknown as { purchase_line_reviews?: Model }).purchase_line_reviews;
const missing = (e: unknown) => (e as { code?: string } | null)?.code === "P2021";
const asObject = (v: unknown) => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};

export async function loadDecisions(workspaceId: string): Promise<Record<string, Decision>> {
  const m = model();
  if (!m) return {};
  const rows = await m.findMany({ where: { workspace_id: workspaceId }, select: { line_id: true, review_json: true } }).catch((e: unknown) => { if (missing(e)) return []; throw e; });
  return Object.fromEntries(rows.map(r => {
    const v = asObject(r.review_json);
    const n = (x: unknown) => typeof x === "number" && Number.isFinite(x) && x > 0 ? x : undefined;
    return [r.line_id, { unidades: n(v.unidades), importe: n(v.importe), ignorar: v.ignorar === true }];
  }));
}

export class DecisionError extends Error {}

export async function saveDecision(input: { workspaceId: string; userId: string; lineId: string; decision: Decision }) {
  const m = model();
  if (!m) throw new DecisionError("Falta preparar la base de datos (script 20261029_purchase_line_reviews.sql).");
  const line = await prisma.engine_records.findFirst({ where: { id: input.lineId, workspace_id: input.workspaceId, status: { not: "archived" } }, select: { id: true } });
  if (!line) throw new DecisionError("Esa compra ya no existe.");
  const value = { ...input.decision, por: input.userId, en: new Date().toISOString() } as Prisma.InputJsonObject;
  await m.upsert({ where: { line_id: line.id }, create: { line_id: line.id, workspace_id: input.workspaceId, review_json: value, decided_by_user_id: input.userId },
    update: { review_json: value, decided_by_user_id: input.userId, updated_at: new Date() } })
    .catch((e: unknown) => { if (missing(e)) throw new DecisionError("Falta preparar la base de datos (script 20261029_purchase_line_reviews.sql)."); throw e; });
}
