import type { InsertPlan } from "./validate-insert-plan";
import type { EngineSnapshot, ReconciliationPreview } from "./reconcile-engine-import";

export type ConflictAnswer = { kind: "keep" | "incoming" | "omit" | "custom"; note?: string };
export type ConflictAnswers = Record<string, ConflictAnswer>;

export function resolveImportConflicts(
  plan: InsertPlan, snapshot: EngineSnapshot, reconciliation: ReconciliationPreview, answers: ConflictAnswers,
) {
  const pending = reconciliation.rows.filter(row => row.action === "review" || row.action === "extend");
  const byId = new Map(pending.map(row => [row.localId, row]));
  const keys = Object.keys(answers);
  if (keys.length !== pending.length || keys.some(key => !byId.has(key)))
    throw new Error("Debes resolver todos los registros pendientes antes de insertar.");
  if (reconciliation.entities.some(item => item.action !== "reuse") ||
      reconciliation.relations.some(item => item.action !== "reuse"))
    throw new Error("La revisión de estructuras y relaciones no admite resolución automática.");
  const omitted = new Set<string>();
  const kept = new Set<string>();
  const updates = new Map<string, { existingId: string; values: Record<string, unknown>; evidence: string }>();
  const originalRows = new Map(plan.rows.map(row => [row.localId, row]));
  for (const row of pending) {
    const answer = answers[row.localId];
    if (!answer || !["keep", "incoming", "omit"].includes(answer.kind))
      throw new Error("Respuesta no compatible con inserción: " + row.localId);
    if (answer.kind === "omit") { omitted.add(row.localId); continue; }
    if (!row.existingId || !(row.reason.startsWith("Conflicto en:") || row.action === "extend"))
      throw new Error("Este conflicto requiere revisión manual: " + row.localId);
    if (answer.kind === "keep") { kept.add(row.localId); continue; }
    const existing = snapshot.records.find(item => item.id === row.existingId);
    const incoming = originalRows.get(row.localId);
    if (!existing || !incoming) throw new Error("Registro de referencia no encontrado");
    const values = { ...existing.values };
    for (const [key, value] of Object.entries(incoming.values)) if (value !== null) values[key] = value;
    updates.set(row.localId, { existingId: row.existingId, values, evidence: incoming.evidence });
  }
  const filteredLinks = plan.links.filter(link => !omitted.has(link.fromLocalId) && !omitted.has(link.toLocalId));
  const filteredRows = plan.rows.filter(row => !omitted.has(row.localId));
  const unresolved = reconciliation.rows.filter(row => row.action === "review" && !omitted.has(row.localId) &&
    !kept.has(row.localId) && !updates.has(row.localId));
  if (unresolved.length) throw new Error("Quedan registros sin resolver");
  const unsafeBlockers = reconciliation.blockers.filter(blocker =>
    !blocker.startsWith("Valores contradictorios:") &&
    !blocker.startsWith("Actualización de registro pendiente de aprobación:") &&
    !blocker.startsWith("Vínculo pendiente:"));
  if (unsafeBlockers.length) throw new Error("Bloqueos pendientes: " + unsafeBlockers.join(" · "));
  return { omitted, kept, updates, filteredRows, filteredLinks };
}
