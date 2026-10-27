import { prisma } from "@/lib/prisma";
import type { TargetedResult } from "../targeted/contract";
import { applyLookups, groupEntities, IDENTIFIER_KEYS, nameKey, normalizeIdentifier, type Lookup, type ReconciledType, type ReconciliationResult } from "./contract";

/** A bounded scan cannot prove that a record does not exist: beyond it, entities stay "no comprobada". */
export const SCAN_LIMIT = 2000;

type Db = Pick<typeof prisma, "engine_object_types" | "engine_records" | "engine_catalog_types">;

/**
 * Reads (never writes) the workspace's Engine records of each reconciled type and indexes them by every
 * identifier field they may use. Archived records are ignored.
 */
export async function loadLookups(workspaceId: string, types: ReconciledType[], db: Db = prisma): Promise<Map<ReconciledType, Lookup>> {
  const lookups = new Map<ReconciledType, Lookup>();
  if (!types.length) return lookups;
  const defined = await db.engine_object_types.findMany({ where: { workspace_id: workspaceId, key: { in: types }, status: { not: "archived" } }, select: { id: true, key: true } });
  for (const type of types) {
    const ids = defined.filter((t: { key: string }) => t.key === type).map((t: { id: string }) => t.id);
    if (!ids.length) {
      // Not used by the workspace yet: if the global catalog defines it, the workspace simply has no records of it
      // (its table is created on the first write), so every entity of this type is new.
      const global = await db.engine_catalog_types.findFirst({ where: { key: type, status: "active" }, select: { id: true } });
      lookups.set(type, { tipoDefinido: Boolean(global), completo: Boolean(global), candidatos: new Map() });
      continue;
    }
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
    // Companies are also indexed by name, only to SUGGEST a match for companies printed without tax id.
    const porNombre = new Map<string, { id: string; nombre: string; clave: string | null }[]>();
    if (type === "company") for (const row of rows.slice(0, SCAN_LIMIT)) {
      const values = row.values_json && typeof row.values_json === "object" && !Array.isArray(row.values_json) ? row.values_json as Record<string, unknown> : {};
      const clave = IDENTIFIER_KEYS.company.map(k => values[k]).find((v): v is string => typeof v === "string" && !!v.trim()) ?? null;
      for (const field of ["legal_name", "trade_name", "name"]) {
        const nombre = values[field];
        if (typeof nombre !== "string" || !nameKey(nombre)) continue;
        const list = porNombre.get(nameKey(nombre)) ?? [];
        if (!list.some(x => x.id === row.id)) porNombre.set(nameKey(nombre), [...list, { id: row.id, nombre, clave: clave && normalizeIdentifier("company", clave) }]);
      }
    }
    lookups.set(type, { tipoDefinido: true, completo: rows.length <= SCAN_LIMIT, candidatos, porNombre });
  }
  return lookups;
}

export async function reconcile(loteId: string, workspaceId: string, extraction: TargetedResult, db: Db = prisma): Promise<ReconciliationResult> {
  const grouped = groupEntities(extraction);
  const types = [...new Set(grouped.entidades.filter(e => e.clave !== null).map(e => e.tipo))];
  return applyLookups(loteId, grouped, await loadLookups(workspaceId, types, db));
}
