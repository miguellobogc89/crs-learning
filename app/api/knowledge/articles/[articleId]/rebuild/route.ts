// app/api/knowledge/articles/[articleId]/rebuild/route.ts

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { analyzeKnowledgeText } from "@/lib/ai/knowledge-analysis";
import { getKnowledgeImportModel } from "@/lib/ai/openai";
import { knowledgeSourceOwnerWhere } from "@/lib/knowledge/access-control";
import { getValidCanonicalAnalysis } from "@/lib/knowledge/file-analysis/article-content-projection";
import { analyzeKnowledgeDocuments } from "@/lib/knowledge/import/analyze-documents";
import { generateArticleContent } from "@/lib/knowledge/import/generate-article-content";
import { truncateDocument } from "@/lib/knowledge/import/truncate-document";
import {
  KNOWLEDGE_TYPES,
  type KnowledgeType,
} from "@/lib/knowledge/knowledge-types";
import type { KnowledgeCatalogTable } from "@/lib/knowledge/knowledge-analysis.types";
import type { KnowledgeFileCanonicalAnalysis } from "@/lib/knowledge/file-analysis/types";
import {
  extractStructuredCatalogTables,
  mergeCatalogTables,
} from "@/lib/knowledge/structured-catalog-tables";
import type {
  KnowledgeImportDocumentAnalysis,
  KnowledgeImportOrganizationArea,
} from "@/lib/knowledge/import/types";
import { prisma } from "@/lib/prisma";
import { updateKnowledgeRelationships } from "@/lib/services/knowledge-graph.service";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RouteContext = {
  params: Promise<{
    articleId: string;
  }>;
};

type RawCatalogTable = {
  title?: unknown;
  description?: unknown;
  source_document_id?: unknown;
  source_document_name?: unknown;
  columns?: unknown;
  rows?: unknown;
};

type RawResponsibility = {
  action?: unknown;
  responsible?: unknown;
  confidence?: unknown;
  notes?: unknown;
};

function normalizeComparableText(
  value: string,
) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function mergeOrganizationAreas(
  analyses: KnowledgeImportDocumentAnalysis[],
) {
  const areasByKey = new Map<
    string,
    KnowledgeImportOrganizationArea
  >();

  for (const analysis of analyses) {
    for (const area of analysis.organizationAreas) {
      const key = normalizeComparableText(area.name);

      if (!key) {
        continue;
      }

      const existing = areasByKey.get(key);

      if (!existing) {
        areasByKey.set(key, {
          ...area,
          aliases: [...area.aliases],
          evidence: [...area.evidence],
        });
        continue;
      }

      const aliases = new Set([
        ...existing.aliases,
        ...area.aliases,
      ]);

      const evidenceByKey = new Map(
        existing.evidence.map((evidence) => [
          `${evidence.text}\n${evidence.reason}`,
          evidence,
        ]),
      );

      for (const evidence of area.evidence) {
        evidenceByKey.set(
          `${evidence.text}\n${evidence.reason}`,
          evidence,
        );
      }

      areasByKey.set(key, {
        ...existing,
        description:
          existing.description || area.description,
        parentAreaName:
          existing.parentAreaName ?? area.parentAreaName,
        confidence: Math.max(
          existing.confidence,
          area.confidence,
        ),
        aliases: Array.from(aliases),
        evidence: Array.from(evidenceByKey.values()),
      });
    }
  }

  return Array.from(areasByKey.values());
}

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

function buildAnalysisCorpus({
  title,
  description,
  knowledgeType,
  files,
}: {
  title: string;
  description: string | null;
  knowledgeType: KnowledgeType;
  files: {
    id: string;
    file_name: string;
    file_type: string | null;
    extracted_text: string;
    knowledge_file_analysis: {
      status: string;
      analysis_json: Prisma.JsonValue | null;
    } | null;
  }[];
}) {
  const documentBlocks = files.map((file, index) => {
    const canonicalAnalysis =
      file.knowledge_file_analysis?.status === "ready"
        ? getValidCanonicalAnalysis(
            file.knowledge_file_analysis.analysis_json,
          )
        : null;

    return [
      `=== DOCUMENTO ${index + 1} ===`,
      `SOURCE_ID: ${file.id}`,
      `FILE_NAME: ${file.file_name}`,
      `FILE_TYPE: ${file.file_type ?? "unknown"}`,
      "",
      "DOCUMENT_TEXT:",
      truncateDocument(file.extracted_text),
      canonicalAnalysis
        ? [
            "",
            "CANONICAL_MODEL:",
            JSON.stringify(canonicalAnalysis),
          ].join("\n")
        : "",
      `=== FIN DOCUMENTO ${index + 1} ===`,
    ].join("\n");
  });

  return [
    "=== UNIDAD DE CONOCIMIENTO ===",
    `TITLE: ${title.trim()}`,
    `DESCRIPTION: ${description?.trim() ?? ""}`,
    `DECLARED_KNOWLEDGE_TYPE: ${knowledgeType}`,
    "",
    "=== DOCUMENTOS FUENTE ===",
    ...documentBlocks,
  ].join("\n\n");
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) =>
    typeof item === "string" ? item : String(item ?? ""),
  );
}

function toStringMatrix(value: unknown): string[][] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(Array.isArray)
    .map((row) =>
      row.map((cell) =>
        typeof cell === "string" ? cell : String(cell ?? ""),
      ),
    );
}

function fromRawCatalogTable(
  table: RawCatalogTable,
): KnowledgeCatalogTable {
  return {
    title:
      typeof table.title === "string"
        ? table.title
        : "",
    description:
      typeof table.description === "string"
        ? table.description
        : "",
    sourceDocumentId:
      typeof table.source_document_id === "string"
        ? table.source_document_id
        : "",
    sourceDocumentName:
      typeof table.source_document_name === "string"
        ? table.source_document_name
        : "",
    columns: toStringArray(table.columns),
    rows: toStringMatrix(table.rows),
  };
}

function toRawCatalogTable(
  table: KnowledgeCatalogTable,
) {
  return {
    title: table.title,
    description: table.description,
    source_document_id: table.sourceDocumentId,
    source_document_name: table.sourceDocumentName,
    columns: table.columns,
    rows: table.rows,
  };
}

function normalizeComparableTextForMatch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getMeaningfulTokens(value: string) {
  return normalizeComparableTextForMatch(value)
    .split(" ")
    .filter((token) => token.length > 2);
}

function tokenOverlap(
  source: string,
  candidate: string,
) {
  const sourceTokens = getMeaningfulTokens(source);
  const candidateTokens = new Set(
    getMeaningfulTokens(candidate),
  );

  if (sourceTokens.length === 0 || candidateTokens.size === 0) {
    return 0;
  }

  const matches = sourceTokens.filter((token) =>
    candidateTokens.has(token),
  ).length;

  return matches / sourceTokens.length;
}

function textMatchesEvidence(
  text: string,
  evidence: string,
) {
  const normalizedText =
    normalizeComparableTextForMatch(text);
  const normalizedEvidence =
    normalizeComparableTextForMatch(evidence);

  if (!normalizedText || !normalizedEvidence) {
    return false;
  }

  return (
    normalizedEvidence.includes(normalizedText) ||
    tokenOverlap(text, evidence) >= 0.55
  );
}

function hasResponsibilityEvidence(
  responsibility: RawResponsibility,
  analyses: KnowledgeFileCanonicalAnalysis[],
) {
  const action =
    typeof responsibility.action === "string"
      ? responsibility.action
      : "";
  const responsible =
    typeof responsibility.responsible === "string"
      ? responsibility.responsible
      : "";

  if (!action.trim() || !responsible.trim()) {
    return false;
  }

  for (const analysis of analyses) {
    const entities = [
      ...analysis.semanticModel.owners,
      ...analysis.semanticModel.lanes,
      ...analysis.semanticModel.steps,
      ...analysis.semanticModel.processes,
      ...analysis.semanticModel.nodes,
    ];

    const entityById = new Map(
      entities.map((entity) => [entity.id, entity]),
    );

    for (const edge of analysis.semanticModel.edges) {
      if (edge.confidence < 0.75 || edge.inferred) {
        continue;
      }

      const from = entityById.get(edge.from);
      const to = entityById.get(edge.to);
      const evidence = [
        edge.label,
        edge.evidence,
        from?.label,
        from?.evidence,
        to?.label,
        to?.evidence,
      ]
        .filter(Boolean)
        .join(" ");

      if (
        textMatchesEvidence(responsible, evidence) &&
        textMatchesEvidence(action, evidence)
      ) {
        return true;
      }
    }
  }

  return false;
}

function normalizeResponsibilities(
  value: unknown,
  analyses: KnowledgeFileCanonicalAnalysis[],
) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    const responsibility = item as RawResponsibility;
    const confidence =
      responsibility.confidence === "identified"
        ? "identified"
        : "undetermined";

    if (
      confidence !== "identified" ||
      hasResponsibilityEvidence(
        responsibility,
        analyses,
      )
    ) {
      return responsibility;
    }

    const notes =
      typeof responsibility.notes === "string"
        ? responsibility.notes
        : "";

    return {
      ...responsibility,
      responsible: "",
      confidence: "undetermined",
      notes: [
        notes,
        "No se ha encontrado evidencia visual o semantica suficiente para vincular la accion con un responsable concreto.",
      ]
        .filter(Boolean)
        .join(" "),
    };
  });
}

export async function POST(
  _request: Request,
  context: RouteContext,
) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "No autorizado" },
      { status: 401 },
    );
  }

  const { articleId } = await context.params;

  if (!articleId) {
    return NextResponse.json(
      { error: "Artículo no válido" },
      { status: 400 },
    );
  }

  const { activeWorkspace } = await getActiveWorkspaceContext(
    session.user.id,
  );

  const article =
    await prisma.knowledge_sources.findFirst({
      where: {
        id: articleId,
        ...knowledgeSourceOwnerWhere(
          session.user.id,
          activeWorkspace.id,
        ),
      },
      select: {
        id: true,
        title: true,
        description: true,
        content: true,
        knowledge_type: true,
        knowledge_analysis: {
          select: {
            analysis_json: true,
          },
        },
        knowledge_files: {
          orderBy: {
            created_at: "asc",
          },
          select: {
            id: true,
            file_name: true,
            file_type: true,
            file_size: true,
            extracted_text: true,
            knowledge_file_analysis: {
              select: {
                status: true,
                schema_version: true,
                analysis_json: true,
                extractor: true,
                model: true,
                prompt_version: true,
                updated_at: true,
              },
            },
          },
        },
      },
    });

  if (!article) {
    return NextResponse.json(
      { error: "Artículo no encontrado" },
      { status: 404 },
    );
  }

  const filesWithText =
    article.knowledge_files.filter(
      (file) => file.extracted_text.trim().length > 0,
    );
  const filesForContent =
    article.knowledge_files.filter((file) => {
      if (file.extracted_text.trim().length > 0) {
        return true;
      }

      if (
        file.knowledge_file_analysis?.status !== "ready"
      ) {
        return false;
      }

      return (
        getValidCanonicalAnalysis(
          file.knowledge_file_analysis.analysis_json,
        ) !== null
      );
    });

  if (filesForContent.length === 0) {
    return NextResponse.json(
      {
        error:
          "El artículo no contiene documentos con texto extraído",
      },
      { status: 400 },
    );
  }

  const startedAt = Date.now();
  const model = getKnowledgeImportModel();

  await prisma.$transaction([
    prisma.knowledge_sources.update({
      where: { id: article.id },
      data: {
        status: "processing",
        updated_at: new Date(),
      },
    }),
    prisma.knowledge_analysis.upsert({
      where: {
        knowledge_source_id: article.id,
      },
      create: {
        knowledge_source_id: article.id,
        status: "processing",
        model,
        prompt_version:
          "knowledge-document-analysis-v1",
        error_message: null,
        updated_at: new Date(),
      },
      update: {
        status: "processing",
        model,
        prompt_version:
          "knowledge-document-analysis-v1",
        error_message: null,
        updated_at: new Date(),
      },
    }),
  ]);

  try {
    const declaredType = normalizeKnowledgeType(
      article.knowledge_type,
    );

    const analysisCorpus = buildAnalysisCorpus({
      title: article.title,
      description: article.description,
      knowledgeType: declaredType,
      files: filesForContent,
    });

    const [
      generatedContent,
      documentAnalyses,
      structuredAnalysis,
    ] =
      await Promise.all([
        generateArticleContent({
          title: article.title,
          description: article.description ?? "",
          existingContent: article.content,
          files: filesForContent.map((file) => {
            const fileAnalysis =
              file.knowledge_file_analysis;
            const canonicalAnalysis =
              fileAnalysis?.status === "ready"
                ? getValidCanonicalAnalysis(
                    fileAnalysis.analysis_json,
                  )
                : null;

            return {
              id: file.id,
              fileName: file.file_name,
              fileType: file.file_type,
              fileSize: file.file_size,
              extractedText: file.extracted_text,
              canonicalAnalysis,
              analysisSchemaVersion:
                fileAnalysis?.schema_version ?? null,
              analysisStatus:
                fileAnalysis?.status ?? null,
            };
          }),
        }),
        filesWithText.length > 0
          ? analyzeKnowledgeDocuments(
              filesWithText.map((file) => ({
                id: file.id,
                name: file.file_name,
                relativePath: file.file_name,
                text: truncateDocument(
                  file.extracted_text,
                ),
              })),
            )
          : Promise.resolve([]),
        analyzeKnowledgeText(
          analysisCorpus,
          declaredType,
        ),
      ]);

    const organizationAreas =
      mergeOrganizationAreas(documentAnalyses);

    const filesWithCanonicalAnalysis =
      filesForContent.map((file) => {
        const fileAnalysis =
          file.knowledge_file_analysis;
        const canonicalAnalysis =
          fileAnalysis?.status === "ready"
            ? getValidCanonicalAnalysis(
                fileAnalysis.analysis_json,
              )
            : null;

        return {
          file,
          canonicalAnalysis,
        };
      });

    const canonicalAnalyses =
      filesWithCanonicalAnalysis
        .map(({ canonicalAnalysis }) => canonicalAnalysis)
        .filter(
          (
            analysis,
          ): analysis is KnowledgeFileCanonicalAnalysis =>
            analysis !== null,
        );

    const extractedCatalogTables =
      extractStructuredCatalogTables(
        filesWithCanonicalAnalysis.map(
          ({ file, canonicalAnalysis }) => {
          return {
            id: file.id,
            fileName: file.file_name,
            fileType: file.file_type,
            extractedText: file.extracted_text,
            canonicalAnalysis,
          };
          },
        ),
      );

    const generatedCatalogTables = Array.isArray(
      structuredAnalysis.analysisJson.catalog_tables,
    )
      ? structuredAnalysis.analysisJson.catalog_tables.map(
          (table: unknown) =>
            fromRawCatalogTable(
              table as RawCatalogTable,
            ),
        )
      : [];

    const catalogTables = mergeCatalogTables(
      generatedCatalogTables,
      extractedCatalogTables,
    ).map(toRawCatalogTable);

    const modelDetectedType = normalizeKnowledgeType(
      typeof structuredAnalysis.analysisJson
        .detected_type === "string"
        ? structuredAnalysis.analysisJson.detected_type
        : null,
    );

    const finalKnowledgeType =
      declaredType === "unknown"
        ? modelDetectedType
        : declaredType;

    const analysisJson = {
      ...structuredAnalysis.analysisJson,
      catalog_tables: catalogTables,
      responsibilities: normalizeResponsibilities(
        structuredAnalysis.analysisJson.responsibilities,
        canonicalAnalyses,
      ),
      organizationAreas,
      documentAnalyses,
      analyzedAt: new Date().toISOString(),
      source_manifest: {
        knowledge_source_id: article.id,
        document_count: filesForContent.length,
        document_ids: filesForContent.map(
          (file) => file.id,
        ),
      },
    } as Prisma.InputJsonValue;

    await prisma.$transaction([
      prisma.knowledge_sources.update({
        where: { id: article.id },
        data: {
          content: generatedContent,
          knowledge_type: finalKnowledgeType,
          summary:
            typeof structuredAnalysis.analysisJson
              .summary === "string"
              ? structuredAnalysis.analysisJson.summary
              : "",
          language:
            structuredAnalysis.analysisJson.meta.language,
          domain:
            structuredAnalysis.analysisJson.meta.domain,
          level:
            structuredAnalysis.analysisJson.meta.level,
          confidence:
            structuredAnalysis.analysisJson.meta
              .confidence,
          tags: structuredAnalysis.analysisJson.tags,
          keywords:
            structuredAnalysis.analysisJson.keywords,
          entities:
            structuredAnalysis.analysisJson.entities,
          status: "ready",
          updated_by_user_id: session.user.id,
          updated_at: new Date(),
        },
      }),
      prisma.knowledge_analysis.upsert({
        where: {
          knowledge_source_id: article.id,
        },
        create: {
          knowledge_source_id: article.id,
          status: "completed",
          analysis_json: analysisJson,
          model: structuredAnalysis.model,
          prompt_version:
            structuredAnalysis.promptVersion,
          tokens_input:
            structuredAnalysis.tokensInput,
          tokens_output:
            structuredAnalysis.tokensOutput,
          processing_ms:
            Date.now() - startedAt,
          error_message: null,
          updated_at: new Date(),
        },
        update: {
          status: "completed",
          analysis_json: analysisJson,
          model: structuredAnalysis.model,
          prompt_version:
            structuredAnalysis.promptVersion,
          tokens_input:
            structuredAnalysis.tokensInput,
          tokens_output:
            structuredAnalysis.tokensOutput,
          processing_ms:
            Date.now() - startedAt,
          error_message: null,
          updated_at: new Date(),
        },
      }),
      prisma.knowledge_graph.upsert({
        where: {
          knowledge_source_id: article.id,
        },
        create: {
          knowledge_source_id: article.id,
          applications:
            structuredAnalysis.analysisJson.applications,
          products:
            structuredAnalysis.analysisJson.products,
          regulations:
            structuredAnalysis.analysisJson.regulations,
          dependencies:
            structuredAnalysis.analysisJson.dependencies,
          related_documents:
            structuredAnalysis.analysisJson
              .related_documents,
        },
        update: {
          applications:
            structuredAnalysis.analysisJson.applications,
          products:
            structuredAnalysis.analysisJson.products,
          regulations:
            structuredAnalysis.analysisJson.regulations,
          dependencies:
            structuredAnalysis.analysisJson.dependencies,
          related_documents:
            structuredAnalysis.analysisJson
              .related_documents,
          updated_at: new Date(),
        },
      }),
    ]);

    await updateKnowledgeRelationships(article.id);
    revalidatePath("/knowledge");
    revalidatePath(`/knowledge/${article.id}`);

    return NextResponse.json({
      success: true,
      articleId: article.id,
      organizationAreas: organizationAreas.length,
      analyzedDocuments: documentAnalyses.length,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "No se ha podido reconstruir el artículo";

    await prisma.$transaction([
      prisma.knowledge_sources.update({
        where: { id: article.id },
        data: {
          status: "error",
          updated_at: new Date(),
        },
      }),
      prisma.knowledge_analysis.upsert({
        where: {
          knowledge_source_id: article.id,
        },
        create: {
          knowledge_source_id: article.id,
          status: "error",
          model,
          prompt_version:
            "knowledge-document-analysis-v1",
          processing_ms: Date.now() - startedAt,
          error_message: errorMessage,
          updated_at: new Date(),
        },
        update: {
          status: "error",
          processing_ms: Date.now() - startedAt,
          error_message: errorMessage,
          updated_at: new Date(),
        },
      }),
    ]).catch(() => undefined);

    console.error("[knowledge-rebuild] failed", {
      articleId: article.id,
      error,
    });

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 },
    );
  }
}
