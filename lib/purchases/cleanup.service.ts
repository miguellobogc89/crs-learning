import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { validateEngineRecordValues } from "@/lib/engine/validation";
import { loadAnalyticsData } from "@/lib/analytics/data";
import { cleanupPlan } from "./cleanup";

/**
 * Applies the cleanup (cleanup.ts) to the workspace's purchase lines: one new revision per line, with the evidence of
 * why each value changed. Needs the invoice lines to have the new fields (catalog SQL 2026-10-29.1).
 */
export class CleanupError extends Error {}
const asObject = (v: unknown) => v && typeof v === "object" && !Array.isArray(v) ? { ...(v as Record<string, unknown>) } : {};
const WHY = { descuento: "el descuento es un porcentaje", envases: "la cantidad son envases; contenido por envase leído del producto", cantidad: "la cantidad se leyó mal: el importe indica otra" };

export async function applyCleanup(input: { workspaceId: string; userId: string }) {
  const fixes = cleanupPlan(await loadAnalyticsData(input.workspaceId));
  if (!fixes.length) return { corregidas: 0 };
  const type = await prisma.engine_object_types.findFirst({ where: { workspace_id: input.workspaceId, key: "invoice_line", status: "active" },
    include: { engine_field_definitions: { where: { status: "active" } } } });
  if (!type) throw new CleanupError("No hay líneas de factura en este espacio.");
  const keys = new Set(type.engine_field_definitions.map((f: { key: string }) => f.key));
  if (!["package_count", "package_content", "package_unit", "discount_percent"].every(k => keys.has(k)))
    throw new CleanupError("Falta ejecutar en Neon el SQL del catálogo (scripts/neon/20261027_standard_catalog.sql) para que las líneas tengan envases y descuento %.");
  let done = 0;
  for (let i = 0; i < fixes.length; i += 100) {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      for (const fix of fixes.slice(i, i + 100)) {
        const record = await tx.engine_records.findFirst({ where: { id: fix.lineId, workspace_id: input.workspaceId, object_type_id: type.id, status: { not: "archived" } },
          select: { id: true, values_json: true, revision: true, schema_version: true } });
        if (!record || record.schema_version !== type.schema_version) continue;
        const next = asObject(record.values_json);
        for (const [k, v] of Object.entries(fix.valores)) { if (v === null) delete next[k]; else next[k] = v; }
        const valid = validateEngineRecordValues(next, type.engine_field_definitions);
        if (!valid.ok) continue;
        const changed = await tx.engine_records.updateMany({ where: { id: record.id, revision: record.revision },
          data: { values_json: valid.values as Prisma.InputJsonObject, revision: { increment: 1 }, updated_by_user_id: input.userId, updated_at: new Date() } });
        if (changed.count !== 1) continue;
        await tx.engine_record_provenance.createMany({ data: Object.keys(fix.valores).filter(k => fix.valores[k] !== null).map(k => ({ workspace_id: input.workspaceId, record_id: record.id,
          revision: record.revision + 1, field_key: k, source_locator: "purchases:cleanup", evidence_text: `Corregido: ${WHY[fix.motivo]} (cuadra al céntimo con el importe).`,
          origin_type: "integration", created_by_user_id: input.userId })) });
        done += 1;
      }
    }, { timeout: 120_000, maxWait: 15_000 });
  }
  return { corregidas: done };
}
