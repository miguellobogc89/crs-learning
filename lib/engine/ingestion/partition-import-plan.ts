import type { UpsertOperation, UpsertPlan } from "../upsert-manifest";

export type ImportPartition = {
  ready: UpsertOperation[];
  pending: { localId: string; reason: string }[];
  deferredLinks: { fromLocalId: string; toLocalId: string; relationKey: string; reason: string }[];
};

/** Keep independent records actionable while deferring links to unresolved records. */
export function partitionImportPlan(plan: UpsertPlan): ImportPartition {
  const ready: UpsertOperation[] = [];
  const pending: ImportPartition["pending"] = [];
  const deferredLinks: ImportPartition["deferredLinks"] = [];
  const actionable = new Set<string>();
  for (const op of plan.operations) {
    if (op.action === "review") pending.push({ localId: op.localId, reason: op.reason });
    if (op.action === "create" || op.action === "reuse") {
      actionable.add(op.localId);
      ready.push(op);
    }
    if (op.action === "create_type" || op.action === "add_field") ready.push(op);
  }
  for (const op of plan.operations) {
    if (op.action !== "link") continue;
    if (actionable.has(op.fromLocalId) && actionable.has(op.toLocalId)) ready.push(op);
    else deferredLinks.push({
      fromLocalId: op.fromLocalId,
      toLocalId: op.toLocalId,
      relationKey: op.relationKey,
      reason: "At least one endpoint is unresolved.",
    });
  }
  return { ready, pending, deferredLinks };
}
