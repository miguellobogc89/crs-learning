import type { Prisma } from "@prisma/client";
import { linkSettings } from "./data";

/**
 * Sets (or clears) the row a link column points to, checking that the column exists in the row's table and that the
 * chosen row belongs to the linked table. One relation per row and column («many rows → one»): the previous one goes.
 */
type Tx = Prisma.TransactionClient;
export class LinkError extends Error {}

export async function setRecordLink(tx: Tx, input: { workspaceId: string; userId: string; recordId: string; columna: string; targetId: string | null }) {
  const record = await tx.engine_records.findFirst({ where: { id: input.recordId, workspace_id: input.workspaceId, status: { not: "archived" } },
    select: { id: true, engine_object_types: { select: { settings: true } } } });
  if (!record) throw new LinkError("La fila ya no existe.");
  const link = linkSettings(record.engine_object_types.settings).find(l => l.columna === input.columna);
  if (!link) throw new LinkError("Esta columna no es un enlace.");
  const def = await tx.engine_relation_definitions.findUnique({ where: { workspace_id_key: { workspace_id: input.workspaceId, key: link.relacion } },
    select: { id: true, from_object_type_id: true, status: true } });
  if (!def || def.status !== "active") throw new LinkError("El enlace ya no existe.");
  if (input.targetId) {
    if (input.targetId === record.id) throw new LinkError("Una fila no puede enlazarse consigo misma.");
    const target = await tx.engine_records.findFirst({ where: { id: input.targetId, workspace_id: input.workspaceId, object_type_id: def.from_object_type_id, status: { not: "archived" } }, select: { id: true } });
    if (!target) throw new LinkError("La fila elegida no pertenece a la tabla enlazada.");
  }
  await tx.engine_record_relations.deleteMany({ where: { workspace_id: input.workspaceId, relation_definition_id: def.id, to_record_id: record.id } });
  if (input.targetId) await tx.engine_record_relations.create({ data: { workspace_id: input.workspaceId, relation_definition_id: def.id,
    from_record_id: input.targetId, to_record_id: record.id, reviewed_by_user_id: input.userId } });
}
