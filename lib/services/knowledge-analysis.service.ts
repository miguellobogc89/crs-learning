// lib/services/knowledge-analysis.service.ts
import { analyzeKnowledgeText } from "@/lib/ai/knowledge-analysis";
import {
  KNOWLEDGE_TYPES,
  KnowledgeType,
} from "@/lib/knowledge/knowledge-types";
import { prisma } from "@/lib/prisma";
import { updateKnowledgeRelationships } from "@/lib/services/knowledge-graph.service";

const MINIMUM_CORPUS_LENGTH = 100;

function normalizeKnowledgeType(
  value: string | null | undefined,
): KnowledgeType {
  if (
    value &&
    KNOWLEDGE_TYPES.includes(value as KnowledgeType)
  ) {
    return value as KnowledgeType;
  }

  return "unknown";
}

type KnowledgeFileInput = {
  id: string;
  file_name: string;
  file_type: string | null;
  extracted_text: string;
  created_at: Date;
};

type BuildKnowledgeCorpusInput = {
  title: string;
  description: string | null;
  content: string;
  knowledgeType: KnowledgeType;
  files: KnowledgeFileInput[];
};

function buildKnowledgeCorpus({
  title,
  description,
  content,
  knowledgeType,
  files,
}: BuildKnowledgeCorpusInput) {
  const availableFiles = files.filter((file) => {
    return file.extracted_text.trim().length > 0;
  });

  const documentBlocks = availableFiles.map(
    (file, index) => {
      return [
        `=== DOCUMENTO ${index + 1} ===`,
        `SOURCE_ID: ${file.id}`,
        `FILE_NAME: ${file.file_name}`,
        `FILE_TYPE: ${file.file_type ?? "unknown"}`,
        `UPLOADED_AT: ${file.created_at.toISOString()}`,
        "",
        "DOCUMENT_TEXT:",
        file.extracted_text.trim(),
        `=== FIN DOCUMENTO ${index + 1} ===`,
      ].join("\n");
    },
  );

  const corpus = [
    "=== UNIDAD DE CONOCIMIENTO ===",
    `TITLE: ${title.trim()}`,
    `DESCRIPTION: ${description?.trim() ?? ""}`,
    `DECLARED_KNOWLEDGE_TYPE: ${knowledgeType}`,
    "",
    "MANUAL_CONTENT:",
    content.trim(),
    "",
    "=== DOCUMENTOS FUENTE ===",
    ...documentBlocks,
  ].join("\n\n");

  if (corpus.trim().length < MINIMUM_CORPUS_LENGTH) {
    throw new Error(
      "La unidad de conocimiento no contiene texto suficiente para analizar",
    );
  }

  if (
    availableFiles.length === 0 &&
    content.trim().length === 0
  ) {
    throw new Error(
      "No existen documentos con texto extraído ni contenido manual",
    );
  }

  return {
    corpus,
    documentCount: availableFiles.length,
    documentIds: availableFiles.map((file) => file.id),
  };
}

export async function analyzeKnowledgeSource(
  knowledgeSourceId: string,
) {
  console.log("START ANALYSIS", knowledgeSourceId);

  await prisma.$transaction([
    prisma.knowledge_analysis.upsert({
      where: {
        knowledge_source_id: knowledgeSourceId,
      },
      create: {
        knowledge_source_id: knowledgeSourceId,
        status: "processing",
        error_message: null,
      },
      update: {
        status: "processing",
        error_message: null,
        updated_at: new Date(),
      },
    }),
    prisma.knowledge_sources.update({
      where: {
        id: knowledgeSourceId,
      },
      data: {
        status: "processing",
        updated_at: new Date(),
      },
    }),
  ]);

  try {
    const source =
      await prisma.knowledge_sources.findUnique({
        where: {
          id: knowledgeSourceId,
        },
        include: {
          knowledge_files: {
            orderBy: [
              {
                created_at: "asc",
              },
              {
                id: "asc",
              },
            ],
          },
        },
      });

    if (!source) {
      throw new Error("Knowledge source not found");
    }

    const declaredType = normalizeKnowledgeType(
      source.knowledge_type,
    );

    const {
      corpus,
      documentCount,
      documentIds,
    } = buildKnowledgeCorpus({
      title: source.title,
      description: source.description,
      content: source.content,
      knowledgeType: declaredType,
      files: source.knowledge_files,
    });

    console.log("ANALYSIS CORPUS READY", {
      knowledgeSourceId,
      documentCount,
      corpusLength: corpus.length,
    });

    const result = await analyzeKnowledgeText(
      corpus,
      declaredType,
    );

    const modelDetectedType = normalizeKnowledgeType(
      typeof result.analysisJson.detected_type === "string"
        ? result.analysisJson.detected_type
        : null,
    );

    let finalKnowledgeType = declaredType;

    if (declaredType === "unknown") {
      finalKnowledgeType = modelDetectedType;
    }

    const enrichedAnalysisJson = {
      ...result.analysisJson,
      source_manifest: {
        knowledge_source_id: knowledgeSourceId,
        document_count: documentCount,
        document_ids: documentIds,
      },
    };

    await prisma.$transaction([
      prisma.knowledge_analysis.update({
        where: {
          knowledge_source_id: knowledgeSourceId,
        },
        data: {
          status: "completed",
          analysis_json: enrichedAnalysisJson,
          model: result.model,
          prompt_version: result.promptVersion,
          tokens_input: result.tokensInput,
          tokens_output: result.tokensOutput,
          processing_ms: result.processingMs,
          error_message: null,
          updated_at: new Date(),
        },
      }),

      prisma.knowledge_sources.update({
        where: {
          id: knowledgeSourceId,
        },
        data: {
          knowledge_type: finalKnowledgeType,
          summary: result.analysisJson.summary,
          language: result.analysisJson.meta.language,
          domain: result.analysisJson.meta.domain,
          level: result.analysisJson.meta.level,
          confidence:
            result.analysisJson.meta.confidence,
          tags: result.analysisJson.tags,
          keywords: result.analysisJson.keywords,
          entities: result.analysisJson.entities,
          status: "ready",
          updated_at: new Date(),
        },
      }),

      prisma.knowledge_graph.upsert({
        where: {
          knowledge_source_id: knowledgeSourceId,
        },
        create: {
          knowledge_source_id: knowledgeSourceId,
          applications:
            result.analysisJson.applications,
          products: result.analysisJson.products,
          regulations:
            result.analysisJson.regulations,
          dependencies:
            result.analysisJson.dependencies,
          related_documents:
            result.analysisJson.related_documents,
        },
        update: {
          applications:
            result.analysisJson.applications,
          products: result.analysisJson.products,
          regulations:
            result.analysisJson.regulations,
          dependencies:
            result.analysisJson.dependencies,
          related_documents:
            result.analysisJson.related_documents,
          updated_at: new Date(),
        },
      }),
    ]);

    await updateKnowledgeRelationships(
      knowledgeSourceId,
    );

    console.log("ANALYSIS SAVED", {
      knowledgeSourceId,
      documentCount,
      finalKnowledgeType,
    });

    return {
      status: "completed" as const,
      documentCount,
      knowledgeType: finalKnowledgeType,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Unknown error";

    await prisma.$transaction([
      prisma.knowledge_analysis.upsert({
        where: {
          knowledge_source_id: knowledgeSourceId,
        },
        create: {
          knowledge_source_id: knowledgeSourceId,
          status: "error",
          error_message: errorMessage,
        },
        update: {
          status: "error",
          error_message: errorMessage,
          updated_at: new Date(),
        },
      }),
      prisma.knowledge_sources.update({
        where: {
          id: knowledgeSourceId,
        },
        data: {
          status: "error",
          updated_at: new Date(),
        },
      }),
    ]);

    console.error("ANALYSIS ERROR", {
      knowledgeSourceId,
      error: errorMessage,
    });

    throw error;
  }
}