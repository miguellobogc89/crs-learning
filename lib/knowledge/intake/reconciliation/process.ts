import { prisma } from "@/lib/prisma";
import type { TargetedResult } from "../targeted/contract";
import { applyLookups, groupEntities, IDENTIFIER_KEYS, normalizeIdentifier, type Lookup, type ReconciledType, type ReconciliationResult } from "./contract";

/** A bounded scan cannot prove that a record does not exist: beyond it, entities stay "no comprobada". */
export const SCAN_LIMIT = 2000;

type Db = Pick<typeof prisma, "engine_object_types" | "engine_records">;

/**
 * Reads (never writes) the workspace's Engine records of each reconciled type and indexes them by every
 * identifier field they may use. Archived records are ignored.
 */
export async function loadLookups(workspaceId: string, types: ReconciledType[], db: Db = prisma): Promise<Map<ReconciledType, Lookup>> {
  const lookups = new Map<ReconciledType, Lookup>();
  if (!types.length) return lookups;
  const defined = await db.engine_object_types.findMany({ where: { workspace_id: workspaceId, key: { in: types }, status: { not: "archived" } }, select: { id: true, key: true } });
  for (const type of types) {
    const ids = defined.filter(t => t.key === type).map(t => t.id);
    if (!ids.length) { lookups.set(type, { tipoDefinido: false, completo: false, candidatos: new Map() }); continue; }
    const rows = await db.engine_records.findMany({ where: { workspace_id: workspaceId, object_type_id: { in: ids }, status: { not: "archived" } },
      select: { id: true, external_key: true, values_json: true }, take: SCAN_LIMIT + 1, orderBy: { id: "asc" } });
    const candidatos = new Map<string, { id: string; externalKey: string | null }[]>();
    const add = (key: string, row: { id: string; external_key: string | null }) => {
      const list = candidatos.get(key) ?? [];
      if (!list.some(c => c.id === row.id)) candidatos.set(key, [...list, { id: row.id, externalKey: row.external_key }]);
    };
    for (const row of rows.slice(0, SCAN_LIMIT)) {
      const values = row.values_json && typeof row.values_json === "object" && !Array.isArray(row.values_json) ? row.values_json as Record<string, unknown> : {};
      for (const field of IDENTIFIER_KEYS[type]) {
        const v = values[field];
        if (typeof v === "string" && v.trim()) add(normalizeIdentifier(type, v), row);
      }
      if (row.external_key?.trim()) add(normalizeIdentifier(type, row.external_key), row);
    }
    lookups.set(type, { tipoDefinido: true, completo: rows.length <= SCAN_LIMIT, candidatos });
  }
  return lookups;
}

export async function reconcile(loteId: string, workspaceId: string, extraction: TargetedResult, db: Db = prisma): Promise<ReconciliationResult> {
  const grouped = groupEntities(extraction);
  const types = [...new Set(grouped.entidades.filter(e => e.clave !== null).map(e => e.tipo))];
  return applyLookups(loteId, grouped, await loadLookups(workspaceId, types, db));
}
