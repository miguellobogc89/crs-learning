import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { validateEngineRecordValues } from "@/lib/engine/validation";
import { loadAnalyticsData } from "@/lib/analytics/data";
import { purchaseCatalog } from "./analytics";
import { reviewPurchases, type AgentAction, type Proposal } from "./agent";

/**
 * An owner's answer to a proposal of the correction agent (lib/purchases/agent): «aplicar» does what it proposes,
 * «descartar» (or «Es correcto») only records the answer. Either way the answer is kept in the catalog table's
 * settings, so the proposal does not come back. The proposal is worked out again from the current data: one that is
 * no longer pending is refused, never applied blind. All in one transaction; every value changed keeps its evidence.
 */
export class AgentError extends Error {}
const asObject = (v: unknown) => v && typeof v === "object" && !Array.isArray(v) ? { ...(v as Record<string, unknown>) } : {};
/** Answers kept: enough for years of a shop's proposals. */
const KEEP = 5000;

export async function answerProposal(input: { workspaceId: string; userId: string; id: string; decision: "aplicar" | "descartar" }) {
  const data = await loadAnalyticsData(input.workspaceId);
  const linked = purchaseCatalog(data);
  const catalogType = linked && data.types?.find(t => t.tableKey === `tabla:${linked.catalog.typeKey}`);
  if (!linked || !catalogType) throw new AgentError("No hay un catálogo de productos enlazado a las compras.");
  const proposal = reviewPurchases(data).find(p => p.id === input.id);
  if (!proposal) throw new AgentError("Esta propuesta ya no está pendiente. Actualiza la página.");
  if (input.decision === "aplicar" && !proposal.accion) throw new AgentError("Esta propuesta no tiene nada que aplicar.");

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    if (input.decision === "aplicar") await apply(tx, input, proposal, proposal.accion!, { catalogTypeId: catalogType.typeId, relationId: linked.relationId,
      aliasField: linked.catalog.campos.some(f => f.key === "alias"), names: new Map(linked.catalog.rows.map(r => [r.id, r.values])) });
    const current = await tx.engine_object_types.findUniqueOrThrow({ where: { id: catalogType.typeId }, select: { settings: true } });
    const settings = asObject(current.settings), agente = asObject(settings.agente);
    const list = Array.isArray(agente.descartadas) ? agente.descartadas.filter((x): x is string => typeof x === "string") : [];
    if (!list.includes(proposal.id)) list.push(proposal.id);
    await tx.engine_object_types.update({ where: { id: catalogType.typeId },
      data: { settings: { ...settings, agente: { ...agente, descartadas: list.slice(-KEEP) } } as Prisma.InputJsonObject, updated_at: new Date() } });
  }, { timeout: 60_000, maxWait: 15_000 });
  return { ok: true as const };
}

type Ctx = { catalogTypeId: string; relationId: string; aliasField: boolean; names: Map<string, Record<string, unknown>> };
type Tx = Prisma.TransactionClient;

async function apply(tx: Tx, input: { workspaceId: string; userId: string }, proposal: Proposal, action: AgentAction, ctx: Ctx) {
  const ws = input.workspaceId;
  const archive = async (id: string) => {
    const changed = await tx.engine_records.updateMany({ where: { id, workspace_id: ws, object_type_id: ctx.catalogTypeId, status: { in: ["draft", "active"] } },
      data: { status: "archived", revision: { increment: 1 }, updated_by_user_id: input.userId, updated_at: new Date() } });
    if (changed.count !== 1) throw new AgentError("El producto ha cambiado o ya no está. Actualiza la página.");
  };
  switch (action.k) {
    case "archivar": return archive(action.productId);
    case "cantidad": {
      const type = await tx.engine_object_types.findFirst({ where: { workspace_id: ws, key: "invoice_line", status: "active" },
        include: { engine_field_definitions: { where: { status: "active" } } } });
      const record = type && await tx.engine_records.findFirst({ where: { id: action.lineId, workspace_id: ws, object_type_id: type.id, status: { not: "archived" } },
        select: { id: true, values_json: true, revision: true, schema_version: true } });
      if (!type || !record || record.schema_version !== type.schema_version) throw new AgentError("La compra ha cambiado o ya no está. Actualiza la página.");
      const valid = validateEngineRecordValues({ ...asObject(record.values_json), quantity: action.quantity }, type.engine_field_definitions);
      if (!valid.ok) throw new AgentError("La cantidad no se puede guardar en esta compra.");
      await save(tx, input, record, valid.values, ["quantity"], `Agente: ${proposal.detalle}`);
      return;
    }
    case "unir": {
      // The purchases of «origen» point to «destino»; its name (and aliases, reference) are kept as aliases of destino.
      await tx.engine_record_relations.updateMany({ where: { workspace_id: ws, relation_definition_id: ctx.relationId, from_record_id: action.origen },
        data: { from_record_id: action.destino } });
      const record = await tx.engine_records.findFirst({ where: { id: action.destino, workspace_id: ws, object_type_id: ctx.catalogTypeId, status: { not: "archived" } },
        select: { id: true, values_json: true, revision: true, schema_version: true } });
      const type = await tx.engine_object_types.findUniqueOrThrow({ where: { id: ctx.catalogTypeId }, include: { engine_field_definitions: { where: { status: "active" } } } });
      if (!record || record.schema_version !== type.schema_version) throw new AgentError("El producto ha cambiado o ya no está. Actualiza la página.");
      const values = asObject(record.values_json), other = ctx.names.get(action.origen) ?? {};
      const text = (v: unknown) => typeof v === "string" && v.trim() ? v.trim() : null;
      const changed: string[] = [];
      if (ctx.aliasField) {
        const aliases = [...new Set([...(text(values.alias)?.split(" | ") ?? []), text(other.producto), ...(text(other.alias)?.split(" | ") ?? [])]
          .filter((x): x is string => !!x && x.toLowerCase() !== (text(values.producto) ?? "").toLowerCase()))];
        if (aliases.length) { values.alias = aliases.join(" | "); changed.push("alias"); }
      }
      if (!text(values.referencia) && text(other.referencia) && type.engine_field_definitions.some((f: { key: string }) => f.key === "referencia")) { values.referencia = text(other.referencia); changed.push("referencia"); }
      if (changed.length) {
        const valid = validateEngineRecordValues(values, type.engine_field_definitions);
        if (!valid.ok) throw new AgentError("No se pudieron guardar los alias del producto.");
        await save(tx, input, record, valid.values, changed, `Agente: unido con «${text(other.producto) ?? "otro producto"}».`);
      }
      await archive(action.origen);
      return;
    }
  }
}

async function save(tx: Tx, input: { workspaceId: string; userId: string }, record: { id: string; revision: number; schema_version: number }, values: unknown, fields: string[], evidence: string) {
  const changed = await tx.engine_records.updateMany({ where: { id: record.id, workspace_id: input.workspaceId, revision: record.revision, schema_version: record.schema_version },
    data: { values_json: values as Prisma.InputJsonObject, revision: { increment: 1 }, updated_by_user_id: input.userId, updated_at: new Date() } });
  if (changed.count !== 1) throw new AgentError("El registro ha cambiado. Actualiza la página.");
  await tx.engine_record_provenance.createMany({ data: fields.map(k => ({ workspace_id: input.workspaceId, record_id: record.id, revision: record.revision + 1,
    field_key: k, source_locator: "purchases:agente", evidence_text: evidence.slice(0, 1000), origin_type: "integration", created_by_user_id: input.userId })) });
}
