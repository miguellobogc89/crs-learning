import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";
import { EXTRACTOR_UPLOAD_TYPE } from "@/lib/knowledge/intake/extractor/contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JsonObject = Record<string, unknown>;
function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function string(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function entries(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.map(object).filter((item): item is JsonObject => Boolean(item)) : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

const stage = (value: unknown) => string(object(value)?.status) ?? "pendiente";
/** Status of each module of the intake pipeline, and the first one not finished (a hint: the modal decides). */
function pipelineStages(status: string, proposal: JsonObject | null) {
  const etapas = {
    lectura_base: stage(proposal?.lecturaBase), clasificacion: stage(proposal?.clasificacion),
    lectura: status === "intake_completed" ? "completed" : status === "intake_error" ? "error" : status === "intake_running" ? "running" : "pendiente",
    verificacion: stage(proposal?.verificacion), conciliacion: stage(proposal?.conciliacion),
  };
  const siguiente = (Object.entries(etapas) as [string, string][]).find(([, s]) => s !== "completed")?.[0] ?? null;
  return { etapas, siguiente };
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
  const imports = await prisma.knowledge_imports.findMany({
    where: {
      owner_user_id: session.user.id,
      knowledge_libraries: { workspace_id: activeWorkspace.id },
    },
    orderBy: { created_at: "desc" },
    take: 20,
    select: {
      id: true,
      status: true,
      processing_status: true,
      upload_type: true,
      library_id: true,
      original_name: true,
      total_files: true,
      completed_files: true,
      failed_files: true,
      error_message: true,
      created_at: true,
      completed_at: true,
      proposal_json: true,
      execution_log_json: true,
      knowledge_import_files: {
        orderBy: [{ processing_order: "asc" }, { created_at: "asc" }],
        select: {
          id: true,
          file_name: true,
          status: true,
          processing_status: true,
          error_message: true,
        },
      },
    },
  });

  return NextResponse.json({
    imports: imports.map(item => {
      const proposal = object(item.proposal_json);
      const inventory = object(proposal?.globalImportMap);
      const execution = object(item.execution_log_json);
      const inventoryDocuments = entries(inventory?.documents);
      const proposedArticles = entries(proposal?.articles);
      const executedArticles = entries(execution?.articles);
      const executedDocuments = entries(execution?.documents);
      const skippedDocuments = entries(execution?.skippedDocuments);
      const hasProposal = Array.isArray(proposal?.articles);
      const articles = item.status === "completed" && executedArticles.length
        ? executedArticles
        : proposedArticles;

      return {
        id: item.id,
        status: item.status,
        processingStatus: item.processing_status,
        name: item.original_name,
        createdAt: item.created_at.toISOString(),
        completedAt: item.completed_at?.toISOString() ?? null,
        totalFiles: item.total_files,
        extractedFiles: item.completed_files,
        failedFiles: item.failed_files,
        error: item.error_message,
        proposalReady: hasProposal,
        // Batches of the current intake pipeline can be resumed module by module from the history.
        pipeline: item.upload_type === EXTRACTOR_UPLOAD_TYPE ? { libraryId: item.library_id, ...pipelineStages(item.status, proposal) } : null,
        articles: articles.map(article => ({
          title: string(article.title) ?? "Artículo sin título",
          action: string(article.action),
          documentIds: strings(article.documentIds),
          createdDocumentIds: strings(article.createdDocumentIds),
        })),
        files: item.knowledge_import_files.map(file => {
          const identified = inventoryDocuments.filter(doc => doc.fileId === file.id);
          const proposedForFile = proposedArticles.filter(article =>
            strings(article.documentIds).includes(file.id));
          const storedForFile = executedDocuments.filter(doc =>
            doc.importFileId === file.id && doc.sourceKind !== "document");
          const skipped = skippedDocuments.find(doc => doc.importFileId === file.id);
          const articleTitles = item.status === "completed"
            ? [...new Set(storedForFile.map(doc => string(doc.articleTitle)).filter((value): value is string => Boolean(value)))]
            : proposedForFile.map(article => string(article.title) ?? "Artículo sin título");

          return {
            id: file.id,
            name: file.file_name,
            status: file.status,
            processingStatus: file.processing_status,
            error: file.error_message,
            documents: identified.map(doc => {
              const routing = object(doc.routing);
              return {
                type: string(doc.type) ?? "sin clasificar",
                category: string(doc.category) ?? "sin clasificar",
                routing: routing ? {
                  knowledge: true,
                  articleCandidate: routing.articleCandidate === true,
                  structuredCandidate: routing.structuredCandidate === true,
                  reason: string(routing.reason) ?? "",
                  structuredFields: strings(routing.structuredFields),
                  existingArticleId: string(routing.existingArticleId),
                  existingStructureKeys: strings(routing.existingStructureKeys),
                } : null,
              };
            }),
            articleTitles,
            skippedAsDuplicate: Boolean(skipped),
            // Null means the article-generation phase has not been reached yet.
            assignedToArticle: hasProposal || Boolean(execution) ? articleTitles.length > 0 : null,
          };
        }),
      };
    }),
  }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
