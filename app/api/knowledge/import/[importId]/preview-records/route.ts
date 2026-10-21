import { auth } from "@/auth";
import { getKnowledgeImportModel, getOpenAIClient } from "@/lib/ai/openai";
import { buildPreviewSchema, normalizePreviewRows } from "@/lib/engine/ingestion/build-preview-schema";
import { reconcilePreviewLinks } from "@/lib/engine/ingestion/reconcile-preview-links";
import { analyzeStructuredDocument } from "@/lib/engine/ingestion/analyze-structured-document.service";
import { buildSimulationManifest } from "@/lib/engine/ingestion/simulation-manifest";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
type Context = { params: Promise<{ importId: string }> };
const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
/** Read-only dry-run. Extract candidate records, never execute an INSERT or UPSERT. */
export async function POST(request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "No autorizado" }, { status: 401 });
  const { importId } = await context.params;
  const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
  const imported = await prisma.knowledge_imports.findFirst({
    where: { id: importId, owner_user_id: session.user.id,
      knowledge_libraries: { workspace_id: activeWorkspace.id } },
    select: { knowledge_import_files: {
      where: { status: "text_ready" },
      select: { id: true, extracted_text: true },
    } },
  });
  if (!imported) return Response.json({ error: "Importación no encontrada" }, { status: 404 });
  const body: unknown = await request.json().catch(() => ({}));
  const requested = isObject(body) && Array.isArray(body.fileIds)
    ? body.fileIds.filter((v): v is string => typeof v === "string") : [];
  const priorDiscoveries = isObject(body) && Array.isArray(body.priorDiscoveries)
    ? body.priorDiscoveries.slice(0, 50) : [];
  const files = imported.knowledge_import_files.filter(file =>
    requested.includes(file.id) && file.extracted_text.trim());
  if (!files.length) return Response.json({ error: "No hay documentos extraídos para preparar registros" }, { status: 409 });
  const types = await prisma.engine_object_types.findMany({
    where: { workspace_id: activeWorkspace.id, status: "active" },
    select: { key: true, name: true, engine_field_definitions: {
      where: { status: "active" }, select: { key: true, name: true, field_type: true },
    } },
  });
  const typeIds = await prisma.engine_object_types.findMany({
    where: { workspace_id: activeWorkspace.id, status: "active" },
    select: { id: true, key: true },
  });
  const typeKeyById = new Map(typeIds.map(type => [type.id, type.key]));
  const relations = await prisma.engine_relation_definitions.findMany({
    where: { workspace_id: activeWorkspace.id, status: "active" },
    select: { key: true, from_object_type_id: true, to_object_type_id: true, cardinality: true },
  });
  const relationDefs = relations.map(relation => ({
    key: relation.key,
    fromEntity: typeKeyById.get(relation.from_object_type_id) ?? "",
    toEntity: typeKeyById.get(relation.to_object_type_id) ?? "",
    cardinality: relation.cardinality,
  })).filter(relation => relation.fromEntity && relation.toEntity);

  const stage = isObject(body) && typeof body.stage === "number" ? body.stage : 5;
  if (![5, 6, 7, 8].includes(stage)) return Response.json({ error: "Fase inválida" }, { status: 400 });
  const drafts = isObject(body) && Array.isArray(body.drafts) ? body.drafts : [];
  const results = [];
  for (const file of files) {
    const started = Date.now();
    try {
      if (file.extracted_text.length > 60000)
        throw new Error("Documento superior a 60000 caracteres; no se genera un manifiesto parcial.");
      const existing = {
        entities: types.map(type => ({ key: type.key,
          fields: type.engine_field_definitions.map(field => ({ key: field.key, type: field.field_type })) })),
        relations: relationDefs,
      };
      const prior = priorDiscoveries.find(item => isObject(item) && item.fileId === file.id);
      const discovered = isObject(prior) ? {
        structures: isObject(prior.structures) && prior.structures.id === file.id && prior.structures.status === "completed" ? prior.structures : null,
        relationships: isObject(prior.relationships) && prior.relationships.id === file.id && prior.relationships.status === "completed" ? prior.relationships : null,
      } : null;
      const priorContext = discovered && JSON.stringify(discovered).length <= 20000 ? discovered : null;
      const saved = drafts.find(item => isObject(item) && item.id === file.id);
      const previous = isObject(saved) && isObject(saved.payload) && JSON.stringify(saved.payload).length <= 350000
        ? saved.payload : null;
      if (stage !== 5 && !previous) throw new Error("Falta el resultado de extracción de la fase 5.");
      let payload: Record<string, unknown>;
      if (stage === 5) {
        if (!priorContext?.structures || !priorContext?.relationships)
          throw new Error("Faltan los descubrimientos de las fases 3 y 4; no se puede extraer sin redescubrir.");
        const chunks: string[] = [];
        const lines = file.extracted_text.split(/(?<=\n)/);
        let chunk = "";
        for (const line of lines) {
          if (chunk && chunk.length + line.length > 2600) {
            chunks.push(chunk); chunk = "";
          }
          if (line.length > 2600) {
            if (chunk) { chunks.push(chunk); chunk = ""; }
            for (let offset = 0; offset < line.length; offset += 2600)
              chunks.push(line.slice(offset, offset + 2600));
          } else chunk += line;
        }
        if (chunk) chunks.push(chunk);
        if (chunks.length > 20) throw new Error("Documento demasiado extenso para la extracción por lotes (máximo 20).");
        const extracted: unknown[] = [];
        const compactExisting = existing.entities.map(e => ({ key: e.key, fields: e.fields.map(f => f.key) }));
        for (const [index, part] of chunks.entries()) {
          const response = await getOpenAIClient().responses.create({
            model: getKnowledgeImportModel(),
            instructions: [
              "Return JSON object with a rows array ONLY. No schema, relations, links or commentary.",
              "Extract actual records from the supplied text chunk, using the known entity concepts and existing keys.",
              "Each row must contain entity, values and evidence; evidence must be an exact substring of the chunk.",
              "For matched existing entities, use their existing key and field keys.",
              "For new concepts, use concise snake_case entity and field keys. Never invent values.",
              "Do not create entity types for individual products, customers or other record values.",
              "Return at most 35 rows for this chunk. Do not repeat records. No links.",
            ].join("\n"),
            input: JSON.stringify({ format: "json", task: "Extract rows only",
              chunkIndex: index, text: part, existing: compactExisting,
              matchedStructures: priorContext.structures,
              identifiedRelationships: priorContext.relationships }),
            text: { format: { type: "json_object" } },
            reasoning: { effort: "low" },
            max_output_tokens: 6000,
          }, { timeout: 60000, maxRetries: 0 });
          const output = response.output_text?.trim() ?? "";
          if (response.status !== "completed" || !output)
            throw new Error(`Lote ${index + 1}/${chunks.length}: respuesta incompleta (${response.status}; ${response.incomplete_details?.reason ?? "sin detalle"}).`);
          const parsed: unknown = JSON.parse(output);
          if (!isObject(parsed) || !Array.isArray(parsed.rows) || parsed.rows.length > 35)
            throw new Error(`Lote ${index + 1}: formato de registros inválido.`);
          for (const row of parsed.rows) {
            if (!isObject(row) || !isObject(row.values) || typeof row.entity !== "string" ||
              typeof row.evidence !== "string" || !part.includes(row.evidence))
              throw new Error(`Lote ${index + 1}: registro sin evidencia verificable.`);
            extracted.push(row);
          }
        }
        if (extracted.length > 150) throw new Error("Más de 150 registros; dividir el documento antes de simular.");
        const proposal = buildPreviewSchema({ documentId: file.id, text: file.extracted_text,
          existing, prior: priorContext, rows: extracted });
        const normalized = normalizePreviewRows(extracted, proposal);
        payload = { ...proposal, rows: normalized, links: [] };
        results.push({ id: file.id, status: "completed", payload, count: normalized.length,
          durationMs: Date.now() - started, error: null });
        continue;
      }
      payload = { ...previous! };
      if (stage === 6) {
        if (!Array.isArray(payload.rows) || !Array.isArray(payload.relations)) throw new Error("Registros o relaciones inválidos.");
        const response = await getOpenAIClient().responses.create({
          model: getKnowledgeImportModel(),
          instructions: [
            "Return a JSON object with only a links array.",
            "Resolve concrete record-to-record links using the rows and relation definitions provided.",
            "Each link: fromRow, toRow (zero-based indices), relationKey, evidence.",
            "Evidence MUST be an exact contiguous quote from the original document proving the pair.",
            "Never invent pairs or links. Omit unproven links. At most 300 links.",
          ].join("\n"),
          input: JSON.stringify({ text: file.extracted_text, rows: payload.rows, relations: payload.relations,
            previousRelationships: priorContext?.relationships ?? null, task: "Resolve record links only. JSON." }),
          text: { format: { type: "json_object" } },
        }, { timeout: 90000, maxRetries: 0 });
        if (response.status !== "completed" || !response.output_text || response.output_text.length > 150000)
          throw new Error("Resolución de referencias incompleta.");
        const linked: unknown = JSON.parse(response.output_text);
        if (!isObject(linked) || !Array.isArray(linked.links)) throw new Error("Respuesta de vínculos inválida.");
        payload.links = reconcilePreviewLinks(file.extracted_text,
          { entities: payload.entities as never, relations: payload.relations as never, warnings: payload.warnings as never },
          payload.rows, linked.links);
        results.push({ id: file.id, status: "completed", payload, count: (payload.links as unknown[]).length,
          durationMs: Date.now() - started, error: null });
        continue;
      }
      const analysis = await analyzeStructuredDocument({ workspaceId: activeWorkspace.id,
        documentId: file.id, text: file.extracted_text, sourceLimit: 60000,
        existingSchema: existing, priorDiscoveries: priorContext, replayPayload: payload });
      if (!analysis.schema.valid || !analysis.schema.proposal || analysis.truncated)
        throw new Error("Esquema inválido: " + JSON.stringify(analysis.schema.issues));
      if (stage === 7) {
        results.push({ id: file.id, status: "completed", payload, count: analysis.rows.length,
          issues: analysis.issues, durationMs: Date.now() - started, error: null });
        continue;
      }
      const manifest = buildSimulationManifest({ proposal: analysis.schema.proposal,
        rows: analysis.rows, links: analysis.links, text: file.extracted_text, existing });
      const issues = [...analysis.issues, ...manifest.issues, ...analysis.schema.proposal.warnings];
      const partial = issues.length > 0 || manifest.unresolvedLinks.length > 0 ||
        analysis.rows.length >= 150 || analysis.links.length >= 300;
      if (analysis.rows.length >= 150 || analysis.links.length >= 300)
        issues.push("Se alcanzó el límite de extracción; revisar cobertura.");
      results.push({ id: file.id, status: "completed", ...manifest, issues,
        sourceChars: file.extracted_text.length, analyzedChars: analysis.sourceChars,
        partial, durationMs: Date.now() - started, error: null });
    } catch (error) {
      results.push({ id: file.id, status: "error", rows: [], links: [], unresolvedLinks: [], issues: [],
        entities: [], relations: [], sourceChars: file.extracted_text.length, analyzedChars: 0,
        partial: true, durationMs: Date.now() - started,
        error: error instanceof Error ? error.message : String(error) });
    }
  }
  return Response.json({ stage, writesPerformed: false, insertExecuted: false,
    identityValidated: false, referencesValidated: false, files: results });
}
