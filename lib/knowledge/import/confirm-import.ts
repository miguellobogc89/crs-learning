// lib/knowledge/import/confirm-import.ts

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { analyzeKnowledgeSource } from "@/lib/services/knowledge-analysis.service";
import { createKnowledgeStatusSnapshot } from "@/lib/services/knowledge-library.service";

import { generateArticleContent } from "./generate-article-content";
import type {
  ConfirmKnowledgeImportResult,
  KnowledgeImportCreatedArticleLog,
  KnowledgeImportCreatedDocumentLog,
  KnowledgeImportExecutionLog,
  KnowledgeImportProposal,
  KnowledgeImportSkippedDocumentLog,
} from "./types";

type ConfirmKnowledgeImportInput = {
  importId: string;
  userId: string;
};

type PersistedArticle = {
  id: string;
  title: string;
  description: string | null;
  library_id: string | null;
};

type ExistingKnowledgeFile = {
  id: string;
  file_name: string;
  file_size: number | null;
  knowledge_source_id: string;
  knowledge_sources: {
    id: string;
    title: string;
  };
};

function parseProposal(
  value: Prisma.JsonValue | null,
): KnowledgeImportProposal {
  if (!value || typeof value !== "object") {
    throw new Error(
      "La importación no contiene una propuesta válida",
    );
  }

  const proposal =
    value as unknown as KnowledgeImportProposal;

  if (
    !Array.isArray(proposal.folders) ||
    !Array.isArray(proposal.articles) ||
    !Array.isArray(proposal.warnings)
  ) {
    throw new Error(
      "La propuesta guardada no tiene la estructura esperada",
    );
  }

  return proposal;
}

function parseStoredLog(
  value: Prisma.JsonValue | null,
): KnowledgeImportExecutionLog | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as unknown as KnowledgeImportExecutionLog;
}

function normalizeFileName(fileName: string) {
  return fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("es");
}

function getFileIdentity(
  fileName: string,
  fileSize: number | null,
) {
  return `${normalizeFileName(fileName)}::${fileSize ?? "null"}`;
}

function buildImportedContent(
  files: Array<{
    file_name: string;
    extracted_text: string;
  }>,
) {
  return files
    .map((file) =>
      [
        `# ${file.file_name}`,
        "",
        file.extracted_text,
      ].join("\n"),
    )
    .join("\n\n---\n\n");
}

function combineArticleContent(
  existingContent: string | null,
  importedContent: string,
) {
  return [
    existingContent?.trim(),
    importedContent.trim(),
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");
}

function validateProposalReferences(
  proposal: KnowledgeImportProposal,
  importFileIds: Set<string>,
  existingFolderIds: Set<string>,
) {
  const proposedFolderIds = new Set(
    proposal.folders.map((folder) => folder.id),
  );

  const validFolderIds = new Set([
    ...existingFolderIds,
    ...proposedFolderIds,
  ]);

  const assignedDocumentIds = new Set<string>();

  for (const folder of proposal.folders) {
    if (
      folder.parentFolderId &&
      !validFolderIds.has(folder.parentFolderId)
    ) {
      throw new Error(
        `La carpeta propuesta ${folder.id} apunta a una carpeta inexistente`,
      );
    }

    if (folder.parentFolderId === folder.id) {
      throw new Error(
        `La carpeta ${folder.id} no puede ser su propia carpeta padre`,
      );
    }
  }

  for (const article of proposal.articles) {
    if (
      article.action === "update" &&
      !article.existingArticleId
    ) {
      throw new Error(
        `El artículo ${article.id} está marcado como actualización pero no indica el artículo existente`,
      );
    }

    if (
      article.folderId &&
      !validFolderIds.has(article.folderId)
    ) {
      throw new Error(
        `El artículo ${article.id} apunta a una carpeta inexistente`,
      );
    }

    for (const documentId of article.documentIds) {
      if (!importFileIds.has(documentId)) {
        throw new Error(
          `El artículo ${article.id} contiene un documento inexistente: ${documentId}`,
        );
      }

      if (assignedDocumentIds.has(documentId)) {
        throw new Error(
          `El documento ${documentId} está asignado a más de un artículo`,
        );
      }

      assignedDocumentIds.add(documentId);
    }
  }
}

export async function confirmKnowledgeImport({
  importId,
  userId,
}: ConfirmKnowledgeImportInput): Promise<ConfirmKnowledgeImportResult> {
  const startedAt = new Date();

  const knowledgeImport =
    await prisma.knowledge_imports.findFirst({
      where: {
        id: importId,
        owner_user_id: userId,
      },
      include: {
        knowledge_libraries: {
          select: {
            id: true,
            name: true,
          },
        },
        knowledge_import_files: {
          orderBy: {
            created_at: "asc",
          },
        },
      },
    });

  if (!knowledgeImport) {
    throw new Error("Importación no encontrada");
  }

  if (knowledgeImport.status === "completed") {
    const existingLog = parseStoredLog(
      knowledgeImport.execution_log_json,
    );

    if (!existingLog) {
      throw new Error(
        "La importación ya está completada, pero no contiene un log de ejecución",
      );
    }

    return {
      success: true,
      importId,
      status: "completed",
      log: existingLog,
    };
  }

  if (knowledgeImport.status === "confirming") {
    throw new Error(
      "La estructura ya se está creando",
    );
  }

  if (knowledgeImport.status !== "proposal_ready") {
    throw new Error(
      "La importación todavía no está preparada para confirmarse",
    );
  }

  const proposal = parseProposal(
    knowledgeImport.proposal_json,
  );

  const importFilesById = new Map(
    knowledgeImport.knowledge_import_files.map(
      (file) => [file.id, file] as const,
    ),
  );

  const [existingFolders, existingKnowledgeFiles] =
    await Promise.all([
      prisma.knowledge_libraries.findMany({
        where: {
          owner_user_id: userId,
        },
        select: {
          id: true,
        },
      }),
      prisma.knowledge_files.findMany({
        where: {
          knowledge_sources: {
            owner_user_id:
              knowledgeImport.owner_user_id,
          },
        },
        select: {
          id: true,
          file_name: true,
          file_size: true,
          knowledge_source_id: true,
          knowledge_sources: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      }),
    ]);

  const existingFolderIds = new Set(
    existingFolders.map((folder) => folder.id),
  );

  validateProposalReferences(
    proposal,
    new Set(importFilesById.keys()),
    existingFolderIds,
  );

  /*
   * La deduplicación es determinista y se resuelve antes
   * de abrir la transacción. No depende de action=create/update
   * ni de que la IA haya reconocido el artículo correcto.
   */
  const existingFileByIdentity = new Map<
    string,
    ExistingKnowledgeFile
  >();

  for (const file of existingKnowledgeFiles) {
    const identity = getFileIdentity(
      file.file_name,
      file.file_size,
    );

    if (!existingFileByIdentity.has(identity)) {
      existingFileByIdentity.set(identity, file);
    }
  }

  const acceptedImportFileIdByIdentity =
    new Map<string, string>();

  const articlePlans = proposal.articles.map(
    (article) => {
      const articleFiles = article.documentIds.map(
        (documentId) => {
          const file = importFilesById.get(documentId);

          if (!file) {
            throw new Error(
              `No se ha encontrado el documento ${documentId}`,
            );
          }

          return file;
        },
      );

      const filesToCreate = [] as typeof articleFiles;
      const skippedDocuments:
        KnowledgeImportSkippedDocumentLog[] = [];

      for (const importFile of articleFiles) {
        const identity = getFileIdentity(
          importFile.file_name,
          importFile.file_size,
        );

        const existingFile =
          existingFileByIdentity.get(identity);

        if (existingFile) {
          skippedDocuments.push({
            importFileId: importFile.id,
            existingKnowledgeFileId:
              existingFile.id,
            fileName: importFile.file_name,
            fileSize: importFile.file_size,
            articleId:
              existingFile.knowledge_sources.id,
            articleTitle:
              existingFile.knowledge_sources.title,
            reason: "duplicate_name_and_size",
          });
          continue;
        }

        const acceptedImportFileId =
          acceptedImportFileIdByIdentity.get(identity);

        if (acceptedImportFileId) {
          skippedDocuments.push({
            importFileId: importFile.id,
            existingKnowledgeFileId: null,
            duplicateImportFileId:
              acceptedImportFileId,
            fileName: importFile.file_name,
            fileSize: importFile.file_size,
            articleId: article.existingArticleId,
            articleTitle: article.title,
            reason: "duplicate_in_import_batch",
          });
          continue;
        }

        acceptedImportFileIdByIdentity.set(
          identity,
          importFile.id,
        );
        filesToCreate.push(importFile);
      }

      return {
        article,
        filesToCreate,
        skippedDocuments,
        generatedContent: null as string | null,
      };
    },
  );

  /*
   * Esta llamada usa OpenAI y antes se ejecutaba dentro de
   * prisma.$transaction(). Esa era la causa directa del P2028.
   */
  for (const plan of articlePlans) {
    if (
      plan.article.action === "create" &&
      plan.filesToCreate.length > 0
    ) {
      plan.generatedContent =
        await generateArticleContent({
          title: plan.article.title,
          description:
            plan.article.description ?? "",
          files: plan.filesToCreate.map((file) => ({
            id: file.id,
            fileName: file.file_name,
            extractedText: file.extracted_text,
          })),
        });
    }
  }

  await prisma.knowledge_imports.update({
    where: {
      id: importId,
    },
    data: {
      status: "confirming",
      error_message: null,
    },
  });

  try {
    const beforeSnapshot =
      await createKnowledgeStatusSnapshot(
        prisma,
        userId,
      );

    const result = await prisma.$transaction(
      async (tx) => {
        const databaseFolderIdByProposalId =
          new Map<string, string>();

        const createdFolders:
          KnowledgeImportExecutionLog["folders"] = [];

        /*
         * Sólo creamos carpetas que vayan a contener al menos
         * un artículo nuevo con documentación realmente nueva.
         */
        const requiredFolderIds = new Set<string>();
        const folderById = new Map(
          proposal.folders.map(
            (folder) => [folder.id, folder] as const,
          ),
        );

        for (const plan of articlePlans) {
          if (
            plan.article.action !== "create" ||
            plan.filesToCreate.length === 0 ||
            !plan.article.folderId ||
            existingFolderIds.has(plan.article.folderId)
          ) {
            continue;
          }

          let folderId: string | null =
            plan.article.folderId;

          while (folderId) {
            if (requiredFolderIds.has(folderId)) {
              break;
            }

            requiredFolderIds.add(folderId);
            folderId =
              folderById.get(folderId)
                ?.parentFolderId ?? null;
          }
        }

        const rootFolders = proposal.folders.filter(
          (folder) =>
            folder.parentFolderId === null &&
            requiredFolderIds.has(folder.id),
        );

        for (const folder of rootFolders) {
          const created =
            await tx.knowledge_libraries.create({
              data: {
                owner_user_id:
                  knowledgeImport.owner_user_id,
                parent_id:
                  knowledgeImport.library_id,
                name: folder.name,
                position: 0,
                company_id:
                  knowledgeImport.company_id,
                visibility: "restricted",
                created_by_user_id: userId,
                updated_by_user_id: userId,
              },
            });

          databaseFolderIdByProposalId.set(
            folder.id,
            created.id,
          );

          createdFolders.push({
            proposalFolderId: folder.id,
            databaseFolderId: created.id,
            name: created.name,
            parentProposalFolderId: null,
            parentDatabaseFolderId:
              knowledgeImport.library_id,
          });
        }

        const childFolders = proposal.folders.filter(
          (folder) =>
            folder.parentFolderId !== null &&
            requiredFolderIds.has(folder.id),
        );

        for (const folder of childFolders) {
          const parentProposalFolderId =
            folder.parentFolderId;

          if (!parentProposalFolderId) {
            throw new Error(
              `La carpeta ${folder.id} no tiene carpeta padre`,
            );
          }

          const parentDatabaseFolderId =
            databaseFolderIdByProposalId.get(
              parentProposalFolderId,
            ) ??
            (existingFolderIds.has(
              parentProposalFolderId,
            )
              ? parentProposalFolderId
              : undefined);

          if (!parentDatabaseFolderId) {
            throw new Error(
              `No se ha podido resolver la carpeta padre de ${folder.name}`,
            );
          }

          const created =
            await tx.knowledge_libraries.create({
              data: {
                owner_user_id:
                  knowledgeImport.owner_user_id,
                parent_id: parentDatabaseFolderId,
                name: folder.name,
                position: 0,
                company_id:
                  knowledgeImport.company_id,
                visibility: "restricted",
                created_by_user_id: userId,
                updated_by_user_id: userId,
              },
            });

          databaseFolderIdByProposalId.set(
            folder.id,
            created.id,
          );

          createdFolders.push({
            proposalFolderId: folder.id,
            databaseFolderId: created.id,
            name: created.name,
            parentProposalFolderId,
            parentDatabaseFolderId,
          });
        }

        const processedArticles:
          KnowledgeImportCreatedArticleLog[] = [];
        const createdDocuments:
          KnowledgeImportCreatedDocumentLog[] = [];
        const skippedDocuments:
          KnowledgeImportSkippedDocumentLog[] = [];

        for (const plan of articlePlans) {
          const { article, filesToCreate } = plan;
          const articleSkippedDocuments =
            plan.skippedDocuments;

          skippedDocuments.push(
            ...articleSkippedDocuments,
          );

          /*
           * Un create compuesto únicamente por duplicados no debe
           * generar un artículo vacío ni carpetas huérfanas.
           */
          if (
            article.action === "create" &&
            filesToCreate.length === 0
          ) {
            continue;
          }

          let persistedArticle: PersistedArticle;
          let contentChanged = false;

          if (article.action === "update") {
            if (!article.existingArticleId) {
              throw new Error(
                `El artículo ${article.id} está marcado como actualización pero no contiene existingArticleId`,
              );
            }

            const existingArticle =
              await tx.knowledge_sources.findFirst({
                where: {
                  id: article.existingArticleId,
                  owner_user_id:
                    knowledgeImport.owner_user_id,
                },
                select: {
                  id: true,
                  title: true,
                  description: true,
                  content: true,
                  library_id: true,
                },
              });

            if (!existingArticle) {
              throw new Error(
                `No se ha encontrado el artículo existente ${article.existingArticleId}`,
              );
            }

            if (filesToCreate.length > 0) {
              const combinedContent =
                combineArticleContent(
                  existingArticle.content,
                  buildImportedContent(filesToCreate),
                );

              persistedArticle =
                await tx.knowledge_sources.update({
                  where: {
                    id: existingArticle.id,
                  },
                  data: {
                    content: combinedContent,
                    updated_by_user_id: userId,
                  },
                  select: {
                    id: true,
                    title: true,
                    description: true,
                    library_id: true,
                  },
                });

              contentChanged = true;
            } else {
              persistedArticle = existingArticle;
            }
          } else {
            let databaseFolderId: string | undefined;

            if (article.folderId === null) {
              databaseFolderId =
                knowledgeImport.library_id;
            } else {
              databaseFolderId =
                databaseFolderIdByProposalId.get(
                  article.folderId,
                ) ??
                (existingFolderIds.has(
                  article.folderId,
                )
                  ? article.folderId
                  : undefined);
            }

            if (!databaseFolderId) {
              throw new Error(
                `No se ha podido resolver la carpeta del artículo ${article.title}`,
              );
            }

            persistedArticle =
              await tx.knowledge_sources.create({
                data: {
                  owner_user_id:
                    knowledgeImport.owner_user_id,
                  title: article.title,
                  description: article.description,
                  visibility: "private",
                  content:
                    plan.generatedContent ?? "",
                  status: "published",
                  knowledge_type: "article",
                  library_id: databaseFolderId,
                  created_by_user_id: userId,
                  updated_by_user_id: userId,
                  summary: article.description,
                  confidence: article.confidence,
                  company_id:
                    knowledgeImport.company_id,
                },
                select: {
                  id: true,
                  title: true,
                  description: true,
                  library_id: true,
                },
              });

            contentChanged = true;
          }

          const articleDocumentLogs:
            KnowledgeImportCreatedDocumentLog[] = [];

          for (const importFile of filesToCreate) {
            const createdKnowledgeFile =
              await tx.knowledge_files.create({
                data: {
                  knowledge_source_id:
                    persistedArticle.id,
                  file_name: importFile.file_name,
                  file_type: importFile.mime_type,
                  file_size: importFile.file_size,
                  storage_path:
                    importFile.storage_path,
                  extracted_text:
                    importFile.extracted_text,
                  status: "ready",
                  uploaded_by_user_id: userId,
                },
              });

            articleDocumentLogs.push({
              importFileId: importFile.id,
              knowledgeFileId:
                createdKnowledgeFile.id,
              fileName:
                createdKnowledgeFile.file_name,
              fileSize:
                createdKnowledgeFile.file_size,
              articleId: persistedArticle.id,
              articleTitle:
                persistedArticle.title,
              extractedCharacters:
                importFile.extracted_text.length,
              storagePath:
                importFile.storage_path,
            });
          }

          createdDocuments.push(
            ...articleDocumentLogs,
          );

          processedArticles.push({
            proposalArticleId: article.id,
            action: article.action,
            existingArticleId:
              article.existingArticleId,
            databaseArticleId:
              persistedArticle.id,
            title: persistedArticle.title,
            description:
              persistedArticle.description ?? "",
            proposalFolderId: article.folderId,
            databaseFolderId:
              persistedArticle.library_id ??
              knowledgeImport.library_id,
            confidence: article.confidence,
            documentIds: article.documentIds,
            createdDocumentIds:
              filesToCreate.map((file) => file.id),
            skippedDocumentIds:
              articleSkippedDocuments.map(
                (document) =>
                  document.importFileId,
              ),
            knowledgeFileIds:
              articleDocumentLogs.map(
                (document) =>
                  document.knowledgeFileId,
              ),
            contentChanged,
          });
        }

        const completedAt = new Date();

        const executionLog:
          KnowledgeImportExecutionLog = {
          version: "knowledge-import-confirm-v2",
          importId,
          status: "completed",
          startedAt: startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
          durationMs:
            completedAt.getTime() -
            startedAt.getTime(),
          targetLibrary: {
            id: knowledgeImport.knowledge_libraries.id,
            name:
              knowledgeImport.knowledge_libraries.name,
          },
          userId,
          companyId: knowledgeImport.company_id,
          summary: {
            foldersCreated: createdFolders.length,
            articlesCreated:
              processedArticles.filter(
                (article) =>
                  article.action === "create",
              ).length,
            articlesUpdated:
              processedArticles.filter(
                (article) =>
                  article.action === "update" &&
                  article.contentChanged,
              ).length,
            articlesUnchanged:
              processedArticles.filter(
                (article) =>
                  article.action === "update" &&
                  !article.contentChanged,
              ).length,
            documentsCreated:
              createdDocuments.length,
            documentsSkippedAsDuplicates:
              skippedDocuments.length,
            extractedCharactersStored:
              createdDocuments.reduce(
                (total, document) =>
                  total +
                  document.extractedCharacters,
                0,
              ),
            warningsAccepted:
              proposal.warnings.length,
          },
          folders: createdFolders,
          articles: processedArticles,
          documents: createdDocuments,
          skippedDocuments,
          proposalSnapshot: proposal,
        };

        await tx.knowledge_imports.update({
          where: {
            id: importId,
          },
          data: {
            status: "completed",
            completed_at: completedAt,
            execution_log_json:
              executionLog as unknown as Prisma.InputJsonValue,
            error_message: null,
          },
        });

        return executionLog;
      },
      {
        maxWait: 10_000,
        timeout: 30_000,
      },
    );

    const afterSnapshot =
      await createKnowledgeStatusSnapshot(
        prisma,
        userId,
      );

    await prisma.knowledge_events.create({
      data: {
        company_id: knowledgeImport.company_id,
        user_id: userId,
        library_id: knowledgeImport.library_id,
        action: "knowledge.import.completed",
        title: "Importación completada",
        description: [
          `${result.summary.documentsCreated} documentos incorporados`,
          `${result.summary.documentsSkippedAsDuplicates} duplicados omitidos`,
          `${result.articles.length} artículos procesados`,
          `${result.summary.foldersCreated} carpetas creadas`,
        ].join(" · "),
        metadata: {
          ...result,
          snapshots: {
            capturedAt: new Date().toISOString(),
            before: beforeSnapshot,
            after: afterSnapshot,
          },
        } as unknown as Prisma.InputJsonValue,
      },
    });

    const changedArticleIds = new Set(
      result.articles
        .filter((article) => article.contentChanged)
        .map(
          (article) => article.databaseArticleId,
        ),
    );

    for (const articleId of changedArticleIds) {
      await analyzeKnowledgeSource(articleId);
    }

    return {
      success: true,
      importId,
      status: "completed",
      log: result,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "No se ha podido crear la estructura";

    await prisma.knowledge_imports.update({
      where: {
        id: importId,
      },
      data: {
        status: "proposal_ready",
        error_message: errorMessage,
      },
    });

    throw error;
  }
}
