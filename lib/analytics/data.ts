import type { StoredReview } from "@/lib/purchases/review";
import { prisma } from "@/lib/prisma";

/** Prisma P2021: the table does not exist in the database (a SQL script not run yet). */
export const missingTable = (error: unknown) => (error as { code?: string } | null)?.code === "P2021";

/** Records of the workspace used by analytics, with the relations that join them (read-only). */
export type Row = { id: string; values: Record<string, unknown>; revision?: number };
export type AnalyticsData = {
  invoices: Row[]; lines: Row[]; companies: Row[]; supplies: Row[]; consumption: Row[]; telecom: Row[];
  /** relation key → [owner id, owned id] pairs */
  relations: Record<string, [string, string][]>;
  /** record id → the original document it was read from (import file), when known */
  documents?: Record<string, { fileId: string; fileName: string }>;
  /** Tables created from templates (payslips, receipts…), with their definition and records. */
  templates?: TemplateTable[];
  /** Tables created with the assistant (catalogs, recipe lines…), with their columns and records. */
  custom?: CustomTable[];
  /** Link columns added to any table: each row points to one row of another table. */
  links?: LinkColumn[];
  /** Which engine object type is behind each table key (facturas, plantilla:<id>, tabla:<key>…). */
  types?: TableType[];
  /** Reviews of purchase lines accepted by the person (line id → review). */
  reviews?: Record<string, StoredReview>;
};
export type CustomField = { key: string; label: string; type: string; money: boolean; completar: boolean };
export type CustomTable = { typeId: string; typeKey: string; nombre: string; descripcion: string; titulo: string | null; campos: CustomField[]; rows: Row[] };
/** `pairs`: [row of `from`, the row of `to` it points to]. */
export type LinkColumn = { from: string; columna: string; nombre: string; to: string; relationId: string; relationKey: string; pairs: [string, string][]; completar: boolean };
export type TableType = { tableKey: string; typeId: string; typeKey: string; editable: boolean; settings: Record<string, unknown> };
/** Engine type of each base table (the ones whose rows are records). */
export const BASE_TABLE_TYPES: Record<string, string> = { facturas: "invoice", compras: "invoice_line", empresas: "company", suministros: "supply_point" };
export type LinkSetting = { columna: string; nombre: string; relacion: string; destino: string; completar?: boolean };
export const linkSettings = (settings: unknown): LinkSetting[] => {
  const list = settings && typeof settings === "object" ? (settings as { enlaces?: unknown }).enlaces : undefined;
  return Array.isArray(list) ? list.filter((l): l is LinkSetting => !!l && typeof l === "object" && typeof (l as LinkSetting).columna === "string"
    && typeof (l as LinkSetting).relacion === "string" && typeof (l as LinkSetting).destino === "string") : [];
};
export type TemplateTable = { id: string; nombre: string; descripcion: string; campos: { key: string; label: string; type: string }[];
  analitica: { sumar: boolean; categoria: string; importe: string | null; fecha: string | null; tercero: string | null }; rows: Row[] };

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
  // Template tables: their records, read like the others.
  // Without the templates table (its SQL not run yet) analytics works as before, just without these tables.
  const templateDefs = await prisma.intake_templates.findMany({ where: { workspace_id: workspaceId, status: "active" }, orderBy: { created_at: "asc" },
    select: { id: true, nombre: true, object_type_key: true, definition_json: true } }).catch((error: unknown) => { if (missingTable(error)) return []; throw error; });
  const templateTypes = templateDefs.length ? await prisma.engine_object_types.findMany({ where: { workspace_id: workspaceId, key: { in: templateDefs.map((d: { object_type_key: string }) => d.object_type_key) }, status: "active" }, select: { id: true, key: true } }) : [];
  const templates: TemplateTable[] = [];
  for (const d of templateDefs as { id: string; nombre: string; object_type_key: string; definition_json: unknown }[]) {
    const type = templateTypes.find((t: { key: string }) => t.key === d.object_type_key);
    const def = d.definition_json as { descripcion?: string; campos?: { key: string; label: string; type: string }[]; analitica?: TemplateTable["analitica"] };
    const rows = type ? await prisma.engine_records.findMany({ where: { workspace_id: workspaceId, object_type_id: type.id, status: { not: "archived" } },
      select: { id: true, values_json: true, revision: true }, take: ANALYTICS_LIMIT, orderBy: { created_at: "asc" } }) : [];
    templates.push({ id: d.id, nombre: d.nombre, descripcion: def.descripcion ?? "", campos: (def.campos ?? []).map(c => ({ key: c.key, label: c.label, type: c.type })),
      analitica: def.analitica ?? { sumar: false, categoria: "otros", importe: null, fecha: null, tercero: null },
      rows: rows.map((r: { id: string; values_json: unknown; revision: number }) => ({ id: r.id, revision: r.revision, values: r.values_json && typeof r.values_json === "object" && !Array.isArray(r.values_json) ? r.values_json as Record<string, unknown> : {} })) });
  }

  // Where each invoice (and template record) was read: the evidence locator "intake:<batch>/<file>/…" of its values.
  const documents: Record<string, { fileId: string; fileName: string }> = {};
  const traced = [...invoices, ...templates.flatMap(t => t.rows)];
  if (traced.length) {
    const evidence = await prisma.engine_record_provenance.findMany({ where: { workspace_id: workspaceId, record_id: { in: traced.map(i => i.id) }, source_locator: { startsWith: "intake:" } },
      distinct: ["record_id"], select: { record_id: true, source_locator: true } });
    const fileOf = new Map<string, string>();
    for (const e of evidence) { const id = /^intake:[^/]+\/([0-9a-f-]{36})/i.exec(e.source_locator ?? "")?.[1]; if (id) fileOf.set(e.record_id, id); }
    const files = fileOf.size ? await prisma.knowledge_import_files.findMany({ where: { id: { in: [...new Set(fileOf.values())] } }, select: { id: true, file_name: true } }) : [];
    const names = new Map<string, string>(files.map((f: { id: string; file_name: string }) => [f.id, f.file_name]));
    for (const [record, file] of fileOf) if (names.has(file)) documents[record] = { fileId: file, fileName: names.get(file)! };
  }
  const [extra, reviews] = await Promise.all([loadCustomTables(workspaceId, templateDefs as { id: string; object_type_key: string }[]), loadReviews(workspaceId)]);
  if (extra.truncated) truncated = true;
  return { invoices, lines, companies, supplies, consumption, telecom, relations, documents, templates, truncated,
    custom: extra.custom, links: extra.links, types: extra.types, reviews };
}

/** Accepted reviews of purchase lines. Without their table (SQL not run yet) there are simply none. */
async function loadReviews(workspaceId: string): Promise<Record<string, StoredReview>> {
  const model = (prisma as unknown as { purchase_line_reviews?: { findMany: (a: unknown) => Promise<{ line_id: string; review_json: unknown }[]> } }).purchase_line_reviews;
  if (!model) return {};
  const rows = await model.findMany({ where: { workspace_id: workspaceId }, select: { line_id: true, review_json: true } })
    .catch((error: unknown) => { if (missingTable(error)) return []; throw error; });
  return Object.fromEntries(rows.map(r => [r.line_id, { ...asValues(r.review_json), estado: "revisada" } as StoredReview]));
}

const asValues = (v: unknown) => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};

/**
 * Tables created with the assistant (object types with settings.origen = "asistente") and the link columns of any
 * table (settings.enlaces of its type → a relation definition whose pairs are [row, linked row]).
 */
async function loadCustomTables(workspaceId: string, templateDefs: { id: string; object_type_key: string }[]) {
  const all = await prisma.engine_object_types.findMany({ where: { workspace_id: workspaceId, status: "active" },
    select: { id: true, key: true, name: true, description: true, settings: true } }) as { id: string; key: string; name: string; description: string | null; settings: unknown }[];
  const types: TableType[] = [];
  for (const [tableKey, typeKey] of Object.entries(BASE_TABLE_TYPES)) {
    const t = all.find(x => x.key === typeKey);
    if (t) types.push({ tableKey, typeId: t.id, typeKey, editable: false, settings: asValues(t.settings) });
  }
  for (const d of templateDefs) {
    const t = all.find(x => x.key === d.object_type_key);
    if (t) types.push({ tableKey: `plantilla:${d.id}`, typeId: t.id, typeKey: t.key, editable: false, settings: asValues(t.settings) });
  }
  const customTypes = all.filter(t => asValues(t.settings).origen === "asistente");
  for (const t of customTypes) types.push({ tableKey: `tabla:${t.key}`, typeId: t.id, typeKey: t.key, editable: true, settings: asValues(t.settings) });

  let truncated = false;
  const custom: CustomTable[] = [];
  for (const t of customTypes) {
    const [fields, rows] = await Promise.all([
      prisma.engine_field_definitions.findMany({ where: { object_type_id: t.id, status: "active" }, orderBy: { sort_order: "asc" },
        select: { key: true, name: true, field_type: true, configuration: true } }),
      prisma.engine_records.findMany({ where: { workspace_id: workspaceId, object_type_id: t.id, status: { not: "archived" } },
        select: { id: true, values_json: true, revision: true }, take: ANALYTICS_LIMIT + 1, orderBy: { created_at: "asc" } }),
    ]) as [{ key: string; name: string; field_type: string; configuration: unknown }[], { id: string; values_json: unknown; revision: number }[]];
    if (rows.length > ANALYTICS_LIMIT) truncated = true;
    const settings = asValues(t.settings);
    custom.push({ typeId: t.id, typeKey: t.key, nombre: t.name, descripcion: t.description ?? "", titulo: typeof settings.titulo === "string" ? settings.titulo : null,
      campos: fields.map(f => ({ key: f.key, label: f.name, type: f.field_type, money: asValues(f.configuration).money === true, completar: asValues(f.configuration).completar === true })),
      rows: rows.slice(0, ANALYTICS_LIMIT).map(r => ({ id: r.id, revision: r.revision, values: asValues(r.values_json) })) });
  }

  const wanted = types.flatMap(t => linkSettings(t.settings).map(l => ({ from: t.tableKey, ...l })));
  const defs = wanted.length ? await prisma.engine_relation_definitions.findMany({ where: { workspace_id: workspaceId, key: { in: wanted.map(w => w.relacion) }, status: "active" },
    select: { id: true, key: true } }) as { id: string; key: string }[] : [];
  const pairs = defs.length ? await prisma.engine_record_relations.findMany({ where: { workspace_id: workspaceId, relation_definition_id: { in: defs.map(d => d.id) } },
    select: { relation_definition_id: true, from_record_id: true, to_record_id: true } }) as { relation_definition_id: string; from_record_id: string; to_record_id: string }[] : [];
  const links: LinkColumn[] = [];
  for (const w of wanted) {
    const def = defs.find(d => d.key === w.relacion);
    if (!def) continue;
    links.push({ from: w.from, columna: w.columna, nombre: w.nombre, to: w.destino, relationId: def.id, relationKey: def.key, completar: w.completar === true,
      // Stored like the catalog's relations: from the linked row ("one") to the rows that point to it ("many").
      pairs: pairs.filter(p => p.relation_definition_id === def.id).map(p => [p.to_record_id, p.from_record_id]) });
  }
  return { custom, links, types, truncated };
}
