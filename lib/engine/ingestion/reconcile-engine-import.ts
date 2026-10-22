import type { InsertPlan } from "./validate-insert-plan";

/**
 * Pure, read-only reconciliation. No writes, no guessed identity keys.
 * A key is usable only when supplied explicitly by a trusted configuration.
 * Callers must load an isolated snapshot for the active workspace.
 */
export type EngineSnapshot = {
  entities: Array<{ id: string; key: string; fields: Array<{ key: string; type: string }> }>;
  relations: Array<{ id: string; key: string; fromEntity: string; toEntity: string; cardinality: string }>;
  records: Array<{ id: string; entityKey: string; values: Record<string, unknown> }>;
  links: Array<{ relationKey: string; fromId: string; toId: string }>;
};
export type IdentityRules = Record<string, string[]>;
export type ReconciliationDecision = "reuse" | "create" | "extend" | "review";
export type ReconciledRow = {
  localId: string; entityKey: string; action: ReconciliationDecision;
  existingId?: string; reason: string;
};
export type ReconciledLink = {
  fromLocalId: string; toLocalId: string; relationKey: string;
  action: "reuse" | "create" | "review"; reason: string;
};
export type ReconciliationPreview = {
  writesPerformed: false; ready: boolean; blockers: string[];
  entities: Array<{ key: string; action: "reuse" | "create" | "review"; reason: string }>;
  relations: Array<{ key: string; action: "reuse" | "create" | "review"; reason: string }>;
  rows: ReconciledRow[]; links: ReconciledLink[];
  totals: { reuse: number; create: number; extend: number; review: number };
};
const canonical = (v: unknown): string | null => {
  if (typeof v === "string") return v.normalize("NFKC").trim().toLocaleLowerCase("es");
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "boolean") return String(v);
  return null;
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const signature = (values: Record<string, unknown>, keys: string[]): string | null => {
  const parts = keys.map(key => canonical(values[key]));
  return parts.every(v => v !== null && v !== "") ? JSON.stringify(parts) : null;
};
export function reconcileEngineImport(
  plan: InsertPlan, snapshot: EngineSnapshot, identityRules: IdentityRules,
): ReconciliationPreview {
  const blockers: string[] = [];
  const entities = plan.entities.map(entity => {
    const found = snapshot.entities.find(item => item.key === entity.key);
    if (!found) return { key: entity.key, action: "create" as const, reason: "Estructura nueva" };
    const incompatible = entity.fields.find(field =>
      found.fields.some(old => old.key === field.key && old.type !== field.type));
    if (incompatible) {
      blockers.push("Campo incompatible: " + entity.key + "." + incompatible.key);
      return { key: entity.key, action: "review" as const, reason: "Tipos incompatibles" };
    }
    const missing = entity.fields.filter(field => !found.fields.some(old => old.key === field.key));
    if (missing.length) {
      blockers.push("Ampliación de esquema pendiente de aprobación: " + entity.key);
      return { key: entity.key, action: "review" as const, reason: "Nuevos campos requieren aprobación" };
    }
    return { key: entity.key, action: "reuse" as const, reason: "Esquema compatible" };
  });
  const relations = plan.relations.map(relation => {
    const found = snapshot.relations.find(item => item.key === relation.key);
    if (!found) return { key: relation.key, action: "create" as const, reason: "Relación nueva" };
    if (found.fromEntity !== relation.fromEntity || found.toEntity !== relation.toEntity ||
        found.cardinality !== relation.cardinality) {
      blockers.push("Relación incompatible: " + relation.key);
      return { key: relation.key, action: "review" as const, reason: "Definición incompatible" };
    }
    return { key: relation.key, action: "reuse" as const, reason: "Definición compatible" };
  });
  const seen = new Map<string, string>();
  const rows: ReconciledRow[] = plan.rows.map(row => {
    const keys = identityRules[row.entityKey];
    const entity = entities.find(item => item.key === row.entityKey);
    if (entity?.action === "review" || !entity) return {
      localId: row.localId, entityKey: row.entityKey, action: "review", reason: "Esquema pendiente",
    };
    if (!keys?.length || new Set(keys).size !== keys.length ||
        !keys.every(key => plan.entities.find(e => e.key === row.entityKey)?.fields.some(f => f.key === key))) {
      return { localId: row.localId, entityKey: row.entityKey, action: "review",
        reason: "No hay clave de identidad fiable configurada" };
    }
    const sig = signature(row.values, keys);
    if (!sig) return { localId: row.localId, entityKey: row.entityKey, action: "review",
      reason: "Identidad incompleta" };
    const scopedKey = JSON.stringify([row.entityKey, sig]);
    if (seen.has(scopedKey)) {
      blockers.push("Identidad repetida en el documento: " + row.localId);
      return { localId: row.localId, entityKey: row.entityKey, action: "review",
        reason: "Identidad repetida en el documento" };
    }
    seen.set(scopedKey, row.localId);
    const candidates = snapshot.records.filter(record =>
      record.entityKey === row.entityKey && signature(record.values, keys) === sig);
    if (candidates.length > 1) {
      blockers.push("Identidad ambigua: " + row.localId);
      return { localId: row.localId, entityKey: row.entityKey, action: "review",
        reason: "Varios registros existentes comparten identidad" };
    }
    if (!candidates.length) return { localId: row.localId, entityKey: row.entityKey,
      action: "create", reason: "Identidad nueva" };
    const old = candidates[0];
    const conflicts = Object.entries(row.values).filter(([key, value]) =>
      value !== null && old.values[key] !== null && old.values[key] !== undefined &&
      !same(old.values[key], value));
    if (conflicts.length) {
      blockers.push("Valores contradictorios: " + row.localId);
      return { localId: row.localId, entityKey: row.entityKey, action: "review",
        existingId: old.id, reason: "Conflicto en: " + conflicts.map(([key]) => key).join(", ") };
    }
    const additions = Object.entries(row.values).some(([key, value]) =>
      value !== null && (old.values[key] === null || old.values[key] === undefined));
    return { localId: row.localId, entityKey: row.entityKey,
      action: additions ? "extend" : "reuse", existingId: old.id,
      reason: additions ? "Campos vacíos completables; requiere validación" : "Identidad y valores compatibles" };
  });
  // An extension is visible in preview but cannot be applied without a
  // separately validated update plan and provenance/revision handling.
  for (const row of rows) if (row.action === "extend")
    blockers.push("Actualización de registro pendiente de aprobación: " + row.localId);
  const rowByLocalId = new Map(rows.map(row => [row.localId, row]));
  const links: ReconciledLink[] = plan.links.map(link => {
    const from = rowByLocalId.get(link.fromLocalId), to = rowByLocalId.get(link.toLocalId);
    const rel = relations.find(item => item.key === link.relationKey);
    if (!from || !to || from.action === "review" || to.action === "review" || rel?.action === "review" || !rel)
      return { ...link, action: "review", reason: "Extremos o relación pendientes" };
    if (from.existingId && to.existingId && snapshot.links.some(existing =>
      existing.relationKey === link.relationKey &&
      existing.fromId === from.existingId && existing.toId === to.existingId))
      return { ...link, action: "reuse", reason: "Vínculo existente" };
    return { ...link, action: "create", reason: "Vínculo nuevo" };
  });
  for (const link of links) if (link.action === "review")
    blockers.push("Vínculo pendiente: " + link.relationKey);
  const all = [...entities, ...relations, ...rows, ...links];
  const totals = {
    reuse: all.filter(item => item.action === "reuse").length,
    create: all.filter(item => item.action === "create").length,
    extend: rows.filter(item => item.action === "extend").length,
    review: all.filter(item => item.action === "review").length,
  };
  return { writesPerformed: false, ready: blockers.length === 0 && totals.review === 0,
    blockers, entities, relations, rows, links, totals };
}
