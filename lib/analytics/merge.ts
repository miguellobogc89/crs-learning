import { Prisma } from "@prisma/client";

/**
 * "Unir con…": two records of the same company. Every relation of the duplicate (its invoices as issuer or customer,
 * supply points it holds…) moves to the record that stays, values the one that stays lacks are copied (never
 * overwritten), and the duplicate is archived (kept with its history and evidence, out of tables and analytics).
 * All in one transaction; nothing changes if any relation would break its cardinality.
 */
export type Link = { id: string; definitionId: string; cardinality: string; from: string; to: string };
export type MergeStep = { kind: "move"; id: string; from: string; to: string } | { kind: "drop"; id: string };

/** Pure: what happens to each relation of the duplicate. Throws if the result would break a "single owner" rule. */
export function planMerge(sourceId: string, targetId: string, links: Link[]): MergeStep[] {
  const steps: MergeStep[] = [];
  const key = (l: { definitionId: string; from: string; to: string }) => `${l.definitionId}|${l.from}|${l.to}`;
  const existing = new Set(links.filter(l => l.from !== sourceId && l.to !== sourceId).map(key));
  for (const l of links.filter(x => x.from === sourceId || x.to === sourceId)) {
    const moved = { ...l, from: l.from === sourceId ? targetId : l.from, to: l.to === sourceId ? targetId : l.to };
    // A relation between the two records themselves disappears (a record is not related to itself).
    if (moved.from === moved.to || existing.has(key(moved))) { steps.push({ kind: "drop", id: l.id }); continue; }
    if (moved.to === targetId && l.cardinality !== "many_to_many" && links.some(o => o.definitionId === l.definitionId && o.to === targetId && o.from !== moved.from && o.from !== sourceId))
      throw new Error("La empresa que se queda ya tiene otra relación de ese tipo; únelas desde Tablas del motor");
    if (moved.from === targetId && l.cardinality === "one_to_one" && links.some(o => o.definitionId === l.definitionId && o.from === targetId && o.to !== moved.to))
      throw new Error("La empresa que se queda ya tiene otra relación única de ese tipo");
    existing.add(key(moved));
    steps.push({ kind: "move", id: l.id, from: moved.from, to: moved.to });
  }
  return steps;
}

/** Values of the record that stays, completed with the duplicate's where it has none (identity fields included). */
export function mergedValues(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const out = { ...target };
  for (const [k, v] of Object.entries(source)) {
    const empty = out[k] === undefined || out[k] === null || out[k] === "";
    if (empty && v !== undefined && v !== null && v !== "") out[k] = v;
  }
  return out;
}

type Tx = Prisma.TransactionClient;

export async function mergeRecords(tx: Tx, input: { workspaceId: string; userId: string; sourceId: string; targetId: string; typeKey: string }) {
  const { workspaceId, sourceId, targetId } = input;
  if (sourceId === targetId) throw new Error("Elige otra empresa");
  // Same lock as saving imports: nothing writes these records meanwhile.
  await tx.$queryRaw(Prisma.sql`SELECT 1::integer FROM pg_advisory_xact_lock(hashtext(${"engine-intake-write:" + workspaceId}))`);
  const records = await tx.engine_records.findMany({ where: { id: { in: [sourceId, targetId] }, workspace_id: workspaceId, status: { not: "archived" } },
    select: { id: true, revision: true, values_json: true, object_type_id: true, engine_object_types: { select: { key: true } } } });
  const source = records.find((r: { id: string }) => r.id === sourceId), target = records.find((r: { id: string }) => r.id === targetId);
  if (!source || !target) throw new Error("Una de las dos empresas ya no existe");
  if (source.engine_object_types.key !== input.typeKey || target.engine_object_types.key !== input.typeKey) throw new Error("Solo se pueden unir dos empresas");
  const rows = await tx.engine_record_relations.findMany({ where: { workspace_id: workspaceId, OR: [
      { from_record_id: { in: [sourceId, targetId] } }, { to_record_id: { in: [sourceId, targetId] } }] },
    select: { id: true, relation_definition_id: true, from_record_id: true, to_record_id: true, definition: { select: { cardinality: true } } } });
  // The other ends' relations of the same definitions matter for "single owner" checks.
  const others = rows.length ? await tx.engine_record_relations.findMany({ where: { workspace_id: workspaceId,
      relation_definition_id: { in: [...new Set(rows.map((r: { relation_definition_id: string }) => r.relation_definition_id))] },
      to_record_id: { in: [...new Set(rows.map((r: { to_record_id: string }) => r.to_record_id))] } },
    select: { id: true, relation_definition_id: true, from_record_id: true, to_record_id: true, definition: { select: { cardinality: true } } } }) : [];
  const toLink = (r: { id: string; relation_definition_id: string; from_record_id: string; to_record_id: string; definition: { cardinality: string } }): Link =>
    ({ id: r.id, definitionId: r.relation_definition_id, cardinality: r.definition.cardinality, from: r.from_record_id, to: r.to_record_id });
  const links = [...new Map([...rows, ...others].map(r => [r.id, toLink(r)])).values()];
  const steps = planMerge(sourceId, targetId, links);
  for (const s of steps) {
    if (s.kind === "drop") await tx.engine_record_relations.delete({ where: { id: s.id } });
    else await tx.engine_record_relations.update({ where: { id: s.id }, data: { from_record_id: s.from, to_record_id: s.to, reviewed_by_user_id: input.userId } });
  }
  const values = mergedValues(target.values_json as Record<string, unknown>, source.values_json as Record<string, unknown>);
  if (JSON.stringify(values) !== JSON.stringify(target.values_json)) {
    const done = await tx.engine_records.updateMany({ where: { id: targetId, workspace_id: workspaceId, revision: target.revision },
      data: { values_json: values as Prisma.InputJsonObject, revision: { increment: 1 }, updated_by_user_id: input.userId, updated_at: new Date() } });
    if (done.count !== 1) throw new Error("La empresa cambió mientras se unía; vuelve a intentarlo");
  }
  const archived = await tx.engine_records.updateMany({ where: { id: sourceId, workspace_id: workspaceId, revision: source.revision },
    data: { status: "archived", revision: { increment: 1 }, updated_by_user_id: input.userId, updated_at: new Date() } });
  if (archived.count !== 1) throw new Error("La empresa cambió mientras se unía; vuelve a intentarlo");
  return { movidas: steps.filter(s => s.kind === "move").length, descartadas: steps.filter(s => s.kind === "drop").length };
}
