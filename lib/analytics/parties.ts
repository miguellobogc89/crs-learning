import { Prisma } from "@prisma/client";
import { normalizeIdentifier, spanishTaxIdValid } from "@/lib/knowledge/intake/reconciliation/contract";

/**
 * Corrections that change relations, not values: who issued an invoice or who it was billed to (an existing
 * company, a new one, or none), and removing detail lines read twice. In a transaction, under the same lock as
 * saving imports. Records are never deleted: removed lines are archived.
 */
type Tx = Prisma.TransactionClient;
const RELATION = { issuer: "invoice_issuer", customer: "invoice_customer" } as const;
const lock = (tx: Tx, workspaceId: string) => tx.$queryRaw(Prisma.sql`SELECT 1::integer FROM pg_advisory_xact_lock(hashtext(${"engine-intake-write:" + workspaceId}))`);

/** A new company typed by the person: its tax id (if any) must be a valid Spanish one, stored in comparable form. */
export function newCompanyValues(input: { nombre: string; nif?: string | null }): { ok: true; values: Record<string, string>; key: string | null } | { ok: false; error: string } {
  const nombre = input.nombre.replace(/\s+/g, " ").trim();
  if (!nombre) return { ok: false, error: "Escribe el nombre de la empresa" };
  if (nombre.length > 200) return { ok: false, error: "Máximo 200 caracteres" };
  const raw = input.nif?.trim();
  if (!raw) return { ok: true, values: { legal_name: nombre }, key: null };
  const nif = normalizeIdentifier("company", raw);
  if (spanishTaxIdValid(nif) === null) return { ok: false, error: `«${raw}» no es un NIF/CIF válido` };
  return { ok: true, values: { legal_name: nombre, tax_identifier: nif }, key: nif };
}

async function typeId(tx: Tx, workspaceId: string, key: string) {
  const type = await tx.engine_object_types.findUnique({ where: { workspace_id_key: { workspace_id: workspaceId, key } }, select: { id: true, schema_version: true, status: true } });
  if (!type || type.status !== "active") throw new Error(`La tabla «${key}» no está disponible`);
  return type;
}

export async function setInvoiceParty(tx: Tx, input: { workspaceId: string; userId: string; invoiceId: string; role: "issuer" | "customer"; companyId: string | null; nueva?: { nombre: string; nif?: string | null } }) {
  const { workspaceId, userId } = input;
  await lock(tx, workspaceId);
  const invoiceType = await typeId(tx, workspaceId, "invoice");
  const invoice = await tx.engine_records.findFirst({ where: { id: input.invoiceId, workspace_id: workspaceId, object_type_id: invoiceType.id, status: { not: "archived" } }, select: { id: true } });
  if (!invoice) throw new Error("La factura ya no existe");
  const definition = await tx.engine_relation_definitions.findUnique({ where: { workspace_id_key: { workspace_id: workspaceId, key: RELATION[input.role] } }, select: { id: true, status: true } });
  if (!definition || definition.status !== "active") throw new Error("La relación de factura y empresa no está definida");
  const companyType = await typeId(tx, workspaceId, "company");

  let companyId = input.companyId;
  let created = false;
  if (input.nueva) {
    const checked = newCompanyValues(input.nueva);
    if (!checked.ok) throw new Error(checked.error);
    const same = checked.key ? await tx.engine_records.findFirst({ where: { workspace_id: workspaceId, object_type_id: companyType.id, external_key: checked.key, status: { not: "archived" } }, select: { id: true } }) : null;
    if (same) companyId = same.id;
    else {
      const record = await tx.engine_records.create({ data: { workspace_id: workspaceId, object_type_id: companyType.id, external_key: checked.key,
        values_json: checked.values, status: "draft", revision: 1, schema_version: companyType.schema_version, created_by_user_id: userId, updated_by_user_id: userId } });
      // The database may already snapshot revision 1 with a trigger: written only if missing.
      await tx.engine_record_revisions.createMany({ data: [{ workspace_id: workspaceId, record_id: record.id, object_type_id: companyType.id, revision: 1,
        schema_version: companyType.schema_version, status: record.status, values_json: checked.values, changed_by_user_id: userId }], skipDuplicates: true });
      companyId = record.id; created = true;
    }
  } else if (companyId) {
    const company = await tx.engine_records.findFirst({ where: { id: companyId, workspace_id: workspaceId, object_type_id: companyType.id, status: { not: "archived" } }, select: { id: true } });
    if (!company) throw new Error("La empresa elegida ya no existe");
  }
  // An invoice has one issuer and one customer: the previous one is replaced.
  await tx.engine_record_relations.deleteMany({ where: { workspace_id: workspaceId, relation_definition_id: definition.id, to_record_id: invoice.id } });
  if (companyId) await tx.engine_record_relations.create({ data: { workspace_id: workspaceId, relation_definition_id: definition.id, from_record_id: companyId, to_record_id: invoice.id, reviewed_by_user_id: userId } });
  return { companyId, created };
}

/** Archives detail lines (checked to be lines of this workspace). */
export async function archiveLines(tx: Tx, input: { workspaceId: string; userId: string; lineIds: string[] }) {
  if (!input.lineIds.length) return 0;
  await lock(tx, input.workspaceId);
  const lineType = await typeId(tx, input.workspaceId, "invoice_line");
  const done = await tx.engine_records.updateMany({ where: { id: { in: input.lineIds }, workspace_id: input.workspaceId, object_type_id: lineType.id, status: { not: "archived" } },
    data: { status: "archived", revision: { increment: 1 }, updated_by_user_id: input.userId, updated_at: new Date() } });
  return done.count;
}
