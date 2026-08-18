// app/api/knowledge/articles/[articleId]/rebuild/route.ts

import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getKnowledgeImportModel } from "@/lib/ai/openai";
import { knowledgeSourceOwnerWhere } from "@/lib/knowledge/access-control";
import { getValidCanonicalAnalysis } from "@/lib/knowledge/file-analysis/article-content-projection";
import { analyzeKnowledgeDocuments } from "@/lib/knowledge/import/analyze-documents";
import { generateArticleContent } from "@/lib/knowledge/import/generate-article-content";
import { truncateDocument } from "@/lib/knowledge/import/truncate-document";
import type {
  KnowledgeImportDocumentAnalysis,
  KnowledgeImportOrganizationArea,
} from "@/lib/knowledge/import/types";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RouteContext = {
  params: Promise<{
    articleId: string;
  }>;
};

type AnalysisJsonRecord = Record<string, unknown>;

function asAnalysisJsonRecord(
  value: Prisma.JsonValue | null,
): AnalysisJsonRecord {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return {};
  }

  return value as AnalysisJsonRecord;
}

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
    const [generatedContent, documentAnalyses] =
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
      ]);

    const organizationAreas =
      mergeOrganizationAreas(documentAnalyses);

    const previousAnalysis =
      asAnalysisJsonRecord(
        article.knowledge_analysis?.analysis_json ?? null,
      );

    const analysisJson = {
      ...previousAnalysis,
      organizationAreas,
      documentAnalyses,
      analyzedAt: new Date().toISOString(),
    } as Prisma.InputJsonValue;

    await prisma.$transaction([
      prisma.knowledge_sources.update({
        where: { id: article.id },
        data: {
          content: generatedContent,
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
          model,
          prompt_version:
            "knowledge-document-analysis-v1",
          processing_ms: Date.now() - startedAt,
          error_message: null,
          updated_at: new Date(),
        },
        update: {
          status: "completed",
          analysis_json: analysisJson,
          model,
          prompt_version:
            "knowledge-document-analysis-v1",
          processing_ms: Date.now() - startedAt,
          error_message: null,
          updated_at: new Date(),
        },
      }),
    ]);

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
