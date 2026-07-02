// lib/services/knowledge-analysis.service.ts
import { prisma } from "@/lib/prisma";
import { analyzeKnowledgeText } from "@/lib/ai/knowledge-analysis";
import {
  KnowledgeType,
  KNOWLEDGE_TYPES,
} from "@/lib/knowledge/knowledge-types";

function normalizeKnowledgeType(value: string | null | undefined): KnowledgeType {
  if (value && KNOWLEDGE_TYPES.includes(value as KnowledgeType)) {
    return value as KnowledgeType;
  }

  return "unknown";
}

export async function analyzeKnowledgeSource(knowledgeSourceId: string) {
  await prisma.knowledge_analysis.upsert({
    where: {
      knowledge_source_id: knowledgeSourceId,
    },
    create: {
      knowledge_source_id: knowledgeSourceId,
      status: "processing",
    },
    update: {
      status: "processing",
      error_message: null,
      updated_at: new Date(),
    },
  });

  try {
    const source = await prisma.knowledge_sources.findUnique({
      where: {
        id: knowledgeSourceId,
      },
      include: {
        knowledge_files: {
          orderBy: {
            created_at: "asc",
          },
        },
      },
    });

    if (!source) {
      throw new Error("Knowledge source not found");
    }

    const knowledgeType = normalizeKnowledgeType(source.knowledge_type);

    const fullText = [
      `TITLE:\n${source.title}`,
      `DESCRIPTION:\n${source.description ?? ""}`,
      `KNOWLEDGE_TYPE:\n${knowledgeType}`,
      `MANUAL_CONTENT:\n${source.content ?? ""}`,
      ...source.knowledge_files.map((file) => {
        return `FILE: ${file.file_name}\nTYPE: ${file.file_type ?? ""}\nTEXT:\n${file.extracted_text ?? ""}`;
      }),
    ].join("\n\n---\n\n");

    const result = await analyzeKnowledgeText(fullText, knowledgeType);

    await prisma.knowledge_analysis.update({
      where: {
        knowledge_source_id: knowledgeSourceId,
      },
      data: {
        status: "completed",
        analysis_json: result.analysisJson,
        model: result.model,
        prompt_version: result.promptVersion,
        tokens_input: result.tokensInput,
        tokens_output: result.tokensOutput,
        processing_ms: result.processingMs,
        error_message: null,
        updated_at: new Date(),
      },
    });

    const detectedType = normalizeKnowledgeType(
      typeof result.analysisJson.detected_type === "string"
        ? result.analysisJson.detected_type
        : null
    );

    if (knowledgeType === "unknown" && detectedType !== "unknown") {
      await prisma.knowledge_sources.update({
        where: {
          id: knowledgeSourceId,
        },
        data: {
          knowledge_type: detectedType,
          updated_at: new Date(),
        },
      });
    }

    return {
      status: "completed" as const,
    };
  } catch (error) {
    await prisma.knowledge_analysis.update({
      where: {
        knowledge_source_id: knowledgeSourceId,
      },
      data: {
        status: "error",
        error_message: error instanceof Error ? error.message : "Unknown error",
        updated_at: new Date(),
      },
    });

    throw error;
  }
}