import { prisma } from "@/lib/prisma";

/** Records of the workspace used by analytics, with the relations that join them (read-only). */
export type Row = { id: string; values: Record<string, unknown>; revision?: number };
export type AnalyticsData = {
  invoices: Row[]; lines: Row[]; companies: Row[]; supplies: Row[]; consumption: Row[]; telecom: Row[];
  /** relation key → [owner id, owned id] pairs */
  relations: Record<string, [string, string][]>;
  /** record id → the original document it was read from (import file), when known */
  documents?: Record<string, { fileId: string; fileName: string }>;
};

const TYPES = { invoices: "invoice", lines: "invoice_line", companies: "company", supplies: "supply_point", consumption: "energy_consumption", telecom: "telecom_line" } as const;
const RELATIONS = ["invoice_issuer", "invoice_customer", "invoice_lines", "invoice_supply_point", "invoice_energy_consumption", "supply_point_holder"];
/** Analytics reads at most this many records per table; beyond it the page says so. */
export const ANALYTICS_LIMIT = 5000;

export async function loadAnalyticsData(workspaceId: string): Promise<AnalyticsData & { truncated: boolean }> {
  const types = await prisma.engine_object_types.findMany({ where: { workspace_id: workspaceId, key: { in: Object.values(TYPES) }, status: "active" }, select: { id: true, key: true } });
  let truncated = false;
  const load = async (key: string): Promise<Row[]> => {
    const type = types.find(t => t.key === key);
    if (!type) return [];
    const rows = await prisma.engine_records.findMany({ where: { workspace_id: workspaceId, object_type_id: type.id, status: { not: "archived" } },
      select: { id: true, values_json: true, revision: true }, take: ANALYTICS_LIMIT + 1, orderBy: { created_at: "asc" } });
    if (rows.length > ANALYTICS_LIMIT) truncated = true;
    return rows.slice(0, ANALYTICS_LIMIT).map(r => ({ id: r.id, revision: r.revision, values: r.values_json && typeof r.values_json === "object" && !Array.isArray(r.values_json) ? r.values_json as Record<string, unknown> : {} }));
  };
  const [invoices, lines, companies, supplies, consumption, telecom] = await Promise.all(Object.values(TYPES).map(load));
  const definitions = await prisma.engine_relation_definitions.findMany({ where: { workspace_id: workspaceId, key: { in: RELATIONS }, status: "active" }, select: { id: true, key: true } });
  const links = definitions.length ? await prisma.engine_record_relations.findMany({ where: { workspace_id: workspaceId, relation_definition_id: { in: definitions.map(d => d.id) } },
    select: { relation_definition_id: true, from_record_id: true, to_record_id: true } }) : [];
  const relations: Record<string, [string, string][]> = Object.fromEntries(RELATIONS.map(k => [k, []]));
  for (const link of links) {
    const key = definitions.find(d => d.id === link.relation_definition_id)!.key;
    relations[key].push([link.from_record_id, link.to_record_id]);
  }
  // Where each invoice was read: the evidence locator "intake:<batch>/<file>/…" of its values (one per invoice).
  const documents: Record<string, { fileId: string; fileName: string }> = {};
  if (invoices.length) {
    const evidence = await prisma.engine_record_provenance.findMany({ where: { workspace_id: workspaceId, record_id: { in: invoices.map(i => i.id) }, source_locator: { startsWith: "intake:" } },
      distinct: ["record_id"], select: { record_id: true, source_locator: true } });
    const fileOf = new Map<string, string>();
    for (const e of evidence) { const id = /^intake:[^/]+\/([0-9a-f-]{36})/i.exec(e.source_locator ?? "")?.[1]; if (id) fileOf.set(e.record_id, id); }
    const files = fileOf.size ? await prisma.knowledge_import_files.findMany({ where: { id: { in: [...new Set(fileOf.values())] } }, select: { id: true, file_name: true } }) : [];
    const names = new Map(files.map(f => [f.id, f.file_name]));
    for (const [record, file] of fileOf) if (names.has(file)) documents[record] = { fileId: file, fileName: names.get(file)! };
  }
  return { invoices, lines, companies, supplies, consumption, telecom, relations, documents, truncated };
}
