import { prisma } from "@/lib/prisma";
import { getKnowledgeImportModel, getOpenAIClient } from "@/lib/ai/openai";
import { knowledgeSourceReadWhere } from "@/lib/knowledge/access-control";
import { previewEngineImportFromKnowledge } from "./import-knowledge-preview.service";
import { ENGINE_EXTRACTION_INSTRUCTIONS, buildEngineExtractionInput } from "./import-extraction-prompt";
import type { EngineImportCandidate } from "./import-preflight";

function parseCandidates(text: string): EngineImportCandidate[] {
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || !("candidates" in parsed) ||
      !Array.isArray(parsed.candidates) || parsed.candidates.length > 500) {
    throw new Error("Invalid structured extraction response.");
  }
  return parsed.candidates.map((item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("Invalid extraction candidate.");
    }
    const value = item as Record<string, unknown>;
    if (typeof value.objectTypeId !== "string" ||
        typeof value.documentId !== "string" ||
        typeof value.fieldKey !== "string" ||
        typeof value.evidenceText !== "string" ||
        !value.values || typeof value.values !== "object" ||
        Array.isArray(value.values)) {
      throw new Error("Invalid extraction candidate shape.");
    }
    return {
      objectTypeId: value.objectTypeId,
      documentId: value.documentId,
      fieldKey: value.fieldKey,
      evidenceText: value.evidenceText,
      values: value.values as Record<string, unknown>,
    };
  });
}

/**
 * AI-assisted extraction preview. Never writes Engine records.
 * Authorization is checked before sending any document to the model and
 * again when validating its proposed candidates against persisted evidence.
 */
export async function extractEngineCandidatesFromKnowledge(input: {
  workspaceId: string;
  userId: string;
  knowledgeFileIds: string[];
}) {
  if (input.knowledgeFileIds.length === 0 || input.knowledgeFileIds.length > 10 ||
      new Set(input.knowledgeFileIds).size !== input.knowledgeFileIds.length) {
    throw new Error("Choose between 1 and 10 distinct Knowledge files.");
  }

  // Reuse the authorized bridge before any model call.
  await previewEngineImportFromKnowledge({ ...input, candidates: [] });

  const [files, objectTypes] = await Promise.all([
    prisma.knowledge_files.findMany({
      where: {
        id: { in: input.knowledgeFileIds },
        status: "ready",
        knowledge_sources: knowledgeSourceReadWhere(input.userId, input.workspaceId),
      },
      select: { id: true, extracted_text: true },
    }),
    prisma.engine_object_types.findMany({
      where: { workspace_id: input.workspaceId, status: "active" },
      include: { engine_field_definitions: true },
    }),
  ]);

  if (files.length !== input.knowledgeFileIds.length) {
    throw new Error("One or more files are no longer accessible.");
  }
  const definitions = objectTypes.filter((objectType) =>
    objectType.engine_field_definitions.some((field) => field.status === "active") &&
    !objectType.engine_field_definitions.some((field) => field.status === "active" &&
      (field.is_unique || field.field_type === "entity_reference" ||
        field.field_type === "record_reference")));

  if (definitions.length === 0) {
    return { accepted: [] as EngineImportCandidate[], issues: [], proposedCount: 0,
      reason: "NO_SUPPORTED_OBJECT_TYPES" as const };
  }

  const response = await getOpenAIClient().responses.create({
    model: getKnowledgeImportModel(),
    instructions: ENGINE_EXTRACTION_INSTRUCTIONS +
      "\nReturn a JSON object with a candidates array. Each candidate must contain objectTypeId, documentId, fieldKey, evidenceText and values.",
    input: buildEngineExtractionInput({
      documents: files.map((file) => ({ id: file.id, extractedText: file.extracted_text })),
      objectTypes: definitions.map((objectType) => ({
        id: objectType.id,
        key: objectType.key,
        fields: objectType.engine_field_definitions.filter((field) => field.status === "active")
          .map((field) => ({
            key: field.key, fieldType: field.field_type, required: field.is_required,
          })),
      })),
    }),
    text: { format: { type: "json_object" } },
  });

  const candidates = parseCandidates(response.output_text);
  const validated = await previewEngineImportFromKnowledge({ ...input, candidates });
  return { ...validated, proposedCount: candidates.length };
}
