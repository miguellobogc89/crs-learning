import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readKnowledgeFile } from "@/lib/storage/knowledge-storage";
import { EXTRACTOR_UPLOAD_TYPE } from "../extractor/contract";
import type { BaseReadingFile } from "../base-reading/contract";
import type { ClassifiedFile } from "../classifier/contract";
import { extractWithPlans } from "../targeted/extract";
import type { ExtractedRecord } from "../targeted/contract";
import { withTransientRetry } from "../transient";
import { objectTypeKey, templatePlans, templateRecords, validateTemplate, type TemplateDefinition } from "./contract";
import { pendingGroups, type ClassifiedDoc, type DocState, type TemplateRef } from "./pending";
import { partText, proposeTemplate } from "./propose";

/**
 * Templates in the database: the documents they apply to (from the classifications already stored with each import),
 * the proposal, creating the workspace table, and processing one stored document. Nothing is uploaded again: the
 * original, its base reading and its classification are read from the import.
 */
type Tx = Prisma.TransactionClient;
type Payload = { lecturaBase?: { resultado?: { archivos?: BaseReadingFile[] } }; clasificacion?: { resultado?: { archivos?: ClassifiedFile[] } } };

export async function listTemplates(workspaceId: string): Promise<TemplateRef[]> {
  // Before its SQL is run the table does not exist (Prisma P2021): no templates yet, nothing breaks.
  const rows = await prisma.intake_templates.findMany({ where: { workspace_id: workspaceId, status: "active" }, orderBy: { created_at: "asc" } })
    .catch((error: unknown) => { if ((error as { code?: string } | null)?.code === "P2021") return []; throw error; });
  return rows.map((t: { id: string; nombre: string; version: number; definition_json: unknown }) => ({ id: t.id, nombre: t.nombre, version: t.version, definition: t.definition_json as TemplateDefinition }));
}

/** Classified documents of the workspace's imports (only the classification, not the whole payload). */
async function classifiedDocs(workspaceId: string): Promise<ClassifiedDoc[]> {
  const rows = await prisma.$queryRaw<{ import_id: string; archivos: ClassifiedFile[] | null }[]>(Prisma.sql`
    SELECT k.id::text AS import_id, k.proposal_json->'clasificacion'->'resultado'->'archivos' AS archivos
    FROM public.knowledge_imports k JOIN public.knowledge_libraries l ON l.id = k.library_id AND l.workspace_id = ${workspaceId}::uuid
    WHERE k.upload_type = ${EXTRACTOR_UPLOAD_TYPE} AND k.proposal_json->'clasificacion'->>'status' = 'completed'`);
  return rows.flatMap(r => (r.archivos ?? []).map(f => ({ importId: r.import_id, importFileId: f.archivoId, archivo: f.archivo, partes: f.partes ?? [] })));
}

export async function templateOverview(workspaceId: string) {
  const [docs, templates] = await Promise.all([classifiedDocs(workspaceId), listTemplates(workspaceId)]);
  const rows: { template_id: string; import_file_id: string; status: string; template_version: number; records: number; error: string | null }[] = templates.length ? await prisma.intake_template_documents.findMany({ where: { workspace_id: workspaceId, template_id: { in: templates.map(t => t.id) } },
    select: { template_id: true, import_file_id: true, status: true, template_version: true, records: true, error: true } }) : [];
  const states = new Map<string, DocState>(rows.map((r: { template_id: string; import_file_id: string; status: string; template_version: number; records: number; error: string | null }) =>
    [`${r.template_id}|${r.import_file_id}`, { status: r.status as DocState["status"], version: r.template_version, records: r.records, error: r.error }]));
  return { grupos: pendingGroups(docs, templates, states), plantillas: templates };
}

async function payloadOf(workspaceId: string, importId: string) {
  const batch = await prisma.knowledge_imports.findFirst({ where: { id: importId, upload_type: EXTRACTOR_UPLOAD_TYPE, knowledge_libraries: { workspace_id: workspaceId } },
    select: { id: true, proposal_json: true, knowledge_import_files: { select: { id: true, file_name: true, storage_path: true, content_hash: true } } } });
  if (!batch) throw new Error("La importación ya no existe");
  return { ...batch, payload: batch.proposal_json as Payload };
}

/** Proposal from up to 3 documents of the type (the text of their parts of that type). */
export async function proposeFor(workspaceId: string, appliesTo: { familia: string; tipo: string; subtipo: string | null }) {
  const docs = (await classifiedDocs(workspaceId)).filter(d => d.partes.some(p => p.familia === appliesTo.familia && p.tipo === appliesTo.tipo && (p.subtipo ?? null) === appliesTo.subtipo));
  const samples = [];
  for (const doc of docs.slice(0, 3)) {
    const { payload } = await payloadOf(workspaceId, doc.importId);
    const base = payload.lecturaBase?.resultado?.archivos?.find(a => a.archivoId === doc.importFileId);
    if (!base) continue;
    const pages = doc.partes.filter(p => p.tipo === appliesTo.tipo && (p.subtipo ?? null) === appliesTo.subtipo).flatMap(p => p.bloques.map(b => b.pagina));
    samples.push({ archivo: doc.archivo, texto: partText(base.paginas as Parameters<typeof partText>[0], [...new Set(pages)]) });
  }
  return proposeTemplate({ ...appliesTo, samples });
}

/** The workspace table of a template: created on first use; columns added when the template gains fields. */
export async function ensureTemplateType(tx: Tx, workspaceId: string, key: string, t: TemplateDefinition, templateId: string) {
  let type = await tx.engine_object_types.findUnique({ where: { workspace_id_key: { workspace_id: workspaceId, key } }, include: { engine_field_definitions: true } });
  if (type && (type.settings as { template_id?: string } | null)?.template_id !== templateId) throw new Error(`Ya existe otra tabla «${key}» en el espacio de trabajo`);
  if (!type) {
    const created = await tx.engine_object_types.create({ data: { workspace_id: workspaceId, key, name: t.nombre, description: t.descripcion || null, settings: { template_id: templateId, origen: "plantilla" } } });
    type = await tx.engine_object_types.findUniqueOrThrow({ where: { id: created.id }, include: { engine_field_definitions: true } });
  }
  const existing = new Set(type.engine_field_definitions.map((f: { key: string }) => f.key));
  let added = false;
  for (const [i, c] of t.campos.entries()) {
    if (existing.has(c.key)) continue;
    await tx.engine_field_definitions.create({ data: { workspace_id: workspaceId, object_type_id: type.id, key: c.key, name: c.label, field_type: c.type,
      is_required: false, configuration: { description: c.description, identity: c.identity }, sort_order: i } });
    added = true;
  }
  if (added && type.engine_field_definitions.length) await tx.engine_object_types.update({ where: { id: type.id }, data: { schema_version: { increment: 1 }, updated_at: new Date() } });
  return tx.engine_object_types.findUniqueOrThrow({ where: { id: type.id } });
}

export async function createTemplate(workspaceId: string, userId: string, input: unknown) {
  const checked = validateTemplate(input);
  if (!checked.ok) throw new Error(checked.error);
  const t = checked.template;
  return prisma.$transaction(async tx => {
    await tx.$queryRaw(Prisma.sql`SELECT 1::integer FROM pg_advisory_xact_lock(hashtext(${"intake-templates:" + workspaceId}))`);
    const same = await tx.intake_templates.findFirst({ where: { workspace_id: workspaceId, status: "active", familia: t.appliesTo.familia, tipo: t.appliesTo.tipo, subtipo: t.appliesTo.subtipo } });
    if (same) throw new Error(`Ya hay una tabla para este tipo de documento: «${same.nombre}»`);
    let key = objectTypeKey(t.nombre);
    for (let n = 2; await tx.engine_object_types.findUnique({ where: { workspace_id_key: { workspace_id: workspaceId, key } }, select: { id: true } }); n++) key = `${objectTypeKey(t.nombre)}_${n}`;
    const created = await tx.intake_templates.create({ data: { workspace_id: workspaceId, familia: t.appliesTo.familia, tipo: t.appliesTo.tipo, subtipo: t.appliesTo.subtipo,
      nombre: t.nombre, object_type_key: key, definition_json: t as unknown as Prisma.InputJsonValue, created_by_user_id: userId } });
    await ensureTemplateType(tx, workspaceId, key, t, created.id);
    return { id: created.id, key };
  });
}

async function remember(workspaceId: string, userId: string, template: { id: string; version: number }, importFileId: string, data: { status: "completed" | "error" | "ignored"; records?: number; error?: string | null; detail?: Record<string, unknown> }) {
  const row = { status: data.status, records: data.records ?? 0, error: data.error ?? null, template_version: template.version,
    detail_json: (data.detail ?? {}) as Prisma.InputJsonValue, processed_by_user_id: userId, processed_at: new Date() };
  await prisma.intake_template_documents.upsert({ where: { template_id_import_file_id: { template_id: template.id, import_file_id: importFileId } },
    create: { template_id: template.id, workspace_id: workspaceId, import_file_id: importFileId, ...row }, update: row });
}

/** "No es de este tipo" / "No guardar": the document stays out of the table (until the person processes it). */
export async function ignoreDocument(workspaceId: string, userId: string, templateId: string, importFileId: string) {
  const template = await prisma.intake_templates.findFirst({ where: { id: templateId, workspace_id: workspaceId, status: "active" }, select: { id: true, version: true } });
  if (!template) throw new Error("La tabla ya no existe");
  await remember(workspaceId, userId, template, importFileId, { status: "ignored" });
}

/**
 * One stored document through a template: its parts of the type are read again from the original with the
 * template's columns, and the records are saved (an identity already saved is reused, never duplicated).
 */
export async function processDocument(input: { workspaceId: string; userId: string; templateId: string; importId: string; importFileId: string }) {
  const { workspaceId, userId } = input;
  const row = await prisma.intake_templates.findFirst({ where: { id: input.templateId, workspace_id: workspaceId, status: "active" } });
  if (!row) throw new Error("La tabla ya no existe");
  const template = { id: row.id, version: row.version };
  const t = row.definition_json as TemplateDefinition;
  try {
    const batch = await payloadOf(workspaceId, input.importId);
    const file = batch.knowledge_import_files.find((f: { id: string }) => f.id === input.importFileId);
    if (!file?.storage_path) throw new Error("Falta el documento original");
    const classified = batch.payload.clasificacion?.resultado?.archivos?.find(a => a.archivoId === file.id);
    const base = batch.payload.lecturaBase?.resultado?.archivos?.find(a => a.archivoId === file.id);
    if (!classified || !base) throw new Error("Falta la lectura o la clasificación del documento");
    const plans = templatePlans(t, row.id, classified.partes);
    if (!plans.length) throw new Error("El documento no tiene partes de este tipo");
    const incidencias: string[] = [];
    const partes = await withTransientRetry(async () => extractWithPlans(await readKnowledgeFile(file.storage_path!), file.file_name, base, plans, incidencias));
    const records = plans.flatMap(p => templateRecords(t, (partes.get(p.parte.id)?.entidades?.registros ?? []) as ExtractedRecord[],
      { fileHash: file.content_hash ?? file.id, parteId: p.parte.id }).map(r => ({ ...r, parteId: p.parte.id })));
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT 1::integer FROM pg_advisory_xact_lock(hashtext(${"engine-intake-write:" + workspaceId}))`);
      const type = await ensureTemplateType(tx, workspaceId, row.object_type_key, t, row.id);
      let creados = 0, reutilizados = 0;
      for (const r of records) {
        const same = await tx.engine_records.findFirst({ where: { workspace_id: workspaceId, object_type_id: type.id, external_key: r.externalKey, status: { not: "archived" } }, select: { id: true } });
        if (same) { reutilizados++; continue; }
        const created = await tx.engine_records.create({ data: { workspace_id: workspaceId, object_type_id: type.id, external_key: r.externalKey, values_json: r.values,
          status: "draft", revision: 1, schema_version: type.schema_version, created_by_user_id: userId, updated_by_user_id: userId } });
        await tx.engine_record_revisions.createMany({ data: [{ workspace_id: workspaceId, record_id: created.id, object_type_id: type.id, revision: 1,
          schema_version: type.schema_version, status: created.status, values_json: r.values, changed_by_user_id: userId }], skipDuplicates: true });
        if (r.evidencias.length) await tx.engine_record_provenance.createMany({ data: r.evidencias.map(ev => ({ workspace_id: workspaceId, record_id: created.id, revision: 1,
          field_key: ev.campo, source_locator: `intake:${batch.id}/${file.id}${ev.pagina ? `/p${ev.pagina}` : ""}/plantilla:${row.id}.${r.parteId}`,
          evidence_text: `${ev.impreso} · ${file.file_name}`, origin_type: "integration", created_by_user_id: userId })) });
        creados++;
      }
      return { creados, reutilizados };
    }, { timeout: 60_000, maxWait: 15_000 });
    const detail = { ...result, noConvertidos: records.flatMap(r => r.noConvertidos), incidencias };
    await remember(workspaceId, userId, template, file.id, { status: "completed", records: records.length, detail });
    return { estado: "procesado" as const, registros: records.length, ...detail };
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo procesar";
    await remember(workspaceId, userId, template, input.importFileId, { status: "error", error: message });
    return { estado: "error" as const, error: message };
  }
}
