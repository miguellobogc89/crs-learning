import { auth } from "@/auth";
import { getKnowledgeImportModel, getOpenAIClient } from "@/lib/ai/openai";
import { buildSchemaOverview } from "@/lib/engine/ingestion/progressive-analysis.service";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Context = { params: Promise<{ importId: string }> };
const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const str = (value: unknown, limit = 200) =>
  typeof value === "string" ? value.trim().slice(0, limit) : "";

export async function POST(request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "No autorizado" }, { status: 401 });
  const { importId } = await context.params;
  const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
  const imported = await prisma.knowledge_imports.findFirst({
    where: {
      id: importId, owner_user_id: session.user.id,
      knowledge_libraries: { workspace_id: activeWorkspace.id },
    },
    select: {
      knowledge_import_files: {
        where: { status: "text_ready" },
        select: { id: true, extracted_text: true },
      },
    },
  });
  if (!imported) return Response.json({ error: "Importación no encontrada" }, { status: 404 });
  const body: unknown = await request.json().catch(() => ({}));
  const ids = isObject(body) && Array.isArray(body.fileIds)
    ? body.fileIds.filter((id): id is string => typeof id === "string") : [];
  const files = imported.knowledge_import_files.filter(file =>
    ids.includes(file.id) && file.extracted_text.trim());
  if (!files.length) return Response.json({ error: "Sin archivos extraídos" }, { status: 409 });

  const [types, definitions] = await Promise.all([
    prisma.engine_object_types.findMany({
      where: { workspace_id: activeWorkspace.id, status: "active" },
      select: { id: true, key: true, name: true, engine_field_definitions: {
        where: { status: "active" }, select: { key: true },
      } },
    }),
    prisma.engine_relation_definitions.findMany({
      where: { workspace_id: activeWorkspace.id, status: "active" },
      select: { key: true, name: true, from_object_type_id: true,
        to_object_type_id: true, cardinality: true },
    }),
  ]);
  const keysById = new Map(types.map(type => [type.id, type.key]));
  const existingRelations = definitions.map(relation => ({
    key: relation.key, name: relation.name,
    from: keysById.get(relation.from_object_type_id),
    to: keysById.get(relation.to_object_type_id),
    cardinality: relation.cardinality,
  }));
  const results = [];
  for (const file of files) {
    const started = Date.now();
    const sample = buildSchemaOverview(file.extracted_text, 6500);
    try {
      const response = await getOpenAIClient().responses.create({
        model: getKnowledgeImportModel(),
        reasoning: { effort: "low" },
        instructions: [
          "Return a compact JSON object only.",
          "Identify relationships between business entity TYPES evidenced by the document.",
          "Work for any industry; do not assume recipes or any specific domain.",
          "Distinguish entity types from individual records and attribute values.",
          "Consider one-to-many, many-to-many, self-references and association entities when supported.",
          "Compare with existing types and relation definitions. Never claim an existing relation unless its key is supplied.",
          "Propose missing structures only when essential to represent an evidenced relation.",
          "Never write data or create database structures.",
          "Each relation must have an exact short evidence substring copied from the document.",
          "Use JSON {relations:[{fromConcept,toConcept,cardinality,existingRelationKey,reason,evidence}],missingStructures:[{name,reason,evidence}],uncertain:[]}.",
          "existingRelationKey must be an existing key or empty string. Maximum 8 relations and 5 missing structures.",
        ].join("\n"),
        input: JSON.stringify({
          document: sample,
          existingTypes: types.map(type => ({
            key: type.key, name: type.name,
            fields: type.engine_field_definitions.slice(0, 12).map(field => field.key),
          })),
          existingRelations,
        }),
        text: { format: { type: "json_object" } },
        max_output_tokens: 5000,
      }, { timeout: 60000, maxRetries: 1 });
      const output = response.output_text?.trim() ?? "";
      if (response.status !== "completed" || !output)
        throw new Error("Respuesta de IA incompleta: " +
          (response.incomplete_details?.reason ?? response.status));
      const parsed: unknown = JSON.parse(output);
      if (!isObject(parsed)) throw new Error("Formato de respuesta inválido");
      const relationKeys = new Set(existingRelations.map(relation => relation.key));
      const relations = (Array.isArray(parsed.relations) ? parsed.relations : [])
        .filter(isObject).slice(0, 8).map(item => ({
          fromConcept: str(item.fromConcept), toConcept: str(item.toConcept),
          cardinality: str(item.cardinality, 40),
          existingRelationKey: str(item.existingRelationKey, 100),
          reason: str(item.reason), evidence: str(item.evidence),
        })).filter(item => item.fromConcept && item.toConcept && item.evidence &&
          sample.includes(item.evidence) &&
          (!item.existingRelationKey || relationKeys.has(item.existingRelationKey)));
      const missingStructures = (Array.isArray(parsed.missingStructures) ? parsed.missingStructures : [])
        .filter(isObject).slice(0, 5).map(item => ({
          name: str(item.name, 100), reason: str(item.reason),
          evidence: str(item.evidence),
        })).filter(item => item.name && item.evidence && sample.includes(item.evidence));
      const uncertain = (Array.isArray(parsed.uncertain) ? parsed.uncertain : [])
        .map(item => str(item)).filter(Boolean).slice(0, 8);
      results.push({ id: file.id, status: "completed", durationMs: Date.now() - started,
        relations, missingStructures, uncertain, error: null });
    } catch (error) {
      results.push({ id: file.id, status: "error", durationMs: Date.now() - started,
        relations: [], missingStructures: [], uncertain: [],
        error: error instanceof Error ? error.message : String(error) });
    }
  }
  return Response.json({ files: results, stage: "identify_relations", writesPerformed: false });
}
