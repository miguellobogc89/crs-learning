// lib/knowledge/import/confirm-import.ts

import type { Prisma } from "@prisma/client";

import { analyzeKnowledgeSource } from "@/lib/services/knowledge-analysis.service";
import { prisma } from "@/lib/prisma";
import { createKnowledgeStatusSnapshot } from "@/lib/services/knowledge-library.service";

import type {
  ConfirmKnowledgeImportResult,
  KnowledgeImportExecutionLog,
  KnowledgeImportProposal,
} from "./types";

type ConfirmKnowledgeImportInput = {
  importId: string;
  userId: string;
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

  const assignedDocumentIds =
    new Set<string>();

  for (const folder of proposal.folders) {
    if (
      folder.parentFolderId &&
      !validFolderIds.has(folder.parentFolderId)
    ) {
      throw new Error(
        `La carpeta propuesta ${folder.id} apunta a una carpeta inexistente`,
      );
    }

    if (
      folder.parentFolderId === folder.id
    ) {
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

    for (
      const documentId of article.documentIds
    ) {
      if (!importFileIds.has(documentId)) {
        throw new Error(
          `El artículo ${article.id} contiene un documento inexistente: ${documentId}`,
        );
      }

      if (
        assignedDocumentIds.has(documentId)
      ) {
        throw new Error(
          `El documento ${documentId} está asignado a más de un artículo`,
        );
      }

      assignedDocumentIds.add(documentId);
    }
  }

  return Array.from(importFileIds).filter(
    (documentId) =>
      !assignedDocumentIds.has(documentId),
  );
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

  /*
   * Idempotencia:
   * si ya se confirmó, devolvemos el log anterior
   * y no volvemos a crear carpetas ni artículos.
   */
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

  if (
    knowledgeImport.status ===
    "confirming"
  ) {
    throw new Error(
      "La estructura ya se está creando",
    );
  }

  if (
    knowledgeImport.status !==
    "proposal_ready"
  ) {
    throw new Error(
      "La importación todavía no está preparada para confirmarse",
    );
  }

  const proposal = parseProposal(
    knowledgeImport.proposal_json,
  );

  const importFilesById = new Map(
    knowledgeImport.knowledge_import_files.map(
      (file) => [file.id, file],
    ),
  );

const existingFolders =
  await prisma.knowledge_libraries.findMany({
    where: {
      owner_user_id: userId,
    },
    select: {
      id: true,
    },
  });

const existingFolderIds = new Set(
  existingFolders.map(
    (folder) => folder.id,
  ),
);

validateProposalReferences(
  proposal,
  new Set(importFilesById.keys()),
  existingFolderIds,
);

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
    const result = await prisma.$transaction(
      async (tx) => {
        const beforeSnapshot =
  await createKnowledgeStatusSnapshot(tx, userId);
        /*
         * Relaciona los IDs inventados por la IA
         * con los UUID reales creados en PostgreSQL.
         */
        const databaseFolderIdByProposalId =
          new Map<string, string>();

        const createdFolders: KnowledgeImportExecutionLog["folders"] =
          [];

        /*
         * Se crean primero las carpetas raíz.
         */
        const rootFolders =
          proposal.folders.filter(
            (folder) =>
              folder.parentFolderId === null,
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

        /*
         * Las subcarpetas se crean después.
         * El esquema de la IA admite como máximo
         * dos niveles, así que una segunda pasada basta.
         */
        const childFolders =
          proposal.folders.filter(
            (folder) =>
              folder.parentFolderId !== null,
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
            (
              existingFolderIds.has(
                parentProposalFolderId,
              )
                ? parentProposalFolderId
                : undefined
            );

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
                parent_id:
                  parentDatabaseFolderId,
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

        const createdArticles: KnowledgeImportExecutionLog["articles"] =
          [];

        const createdDocuments: KnowledgeImportExecutionLog["documents"] =
          [];

        for (const article of proposal.articles) {
          const articleFiles =
            article.documentIds.map(
              (documentId) => {
                const file =
                  importFilesById.get(documentId);

                if (!file) {
                  throw new Error(
                    `No se ha encontrado el documento ${documentId}`,
                  );
                }

                return file;
              },
            );

          const importedContent = articleFiles
            .map((file) => {
              return [
                `# ${file.file_name}`,
                "",
                file.extracted_text,
              ].join("\n");
            })
            .join("\n\n---\n\n");

          let persistedArticle: {
            id: string;
            title: string;
            description: string | null;
            library_id: string | null;
          };

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

            const combinedContent = [
              existingArticle.content?.trim(),
              importedContent.trim(),
            ]
              .filter(
                (
                  content,
                ): content is string =>
                  Boolean(content),
              )
              .join("\n\n---\n\n");

            persistedArticle =
              await tx.knowledge_sources.update({
                where: {
                  id: existingArticle.id,
                },
                data: {
                  title:
                    article.title ||
                    existingArticle.title,
                  description:
                    article.description ||
                    existingArticle.description,
                  summary:
                    article.description ||
                    existingArticle.description,
                  content: combinedContent,
                  confidence:
                    article.confidence,
                  updated_by_user_id: userId,
                },
                select: {
                  id: true,
                  title: true,
                  description: true,
                  library_id: true,
                },
              });
          } else {
            const databaseFolderId =
              article.folderId === null
                ? knowledgeImport.library_id
                : databaseFolderIdByProposalId.get(
                    article.folderId,
                  ) ??
                  (
                    existingFolderIds.has(
                      article.folderId,
                    )
                      ? article.folderId
                      : undefined
                  );

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
                  description:
                    article.description,
                  visibility: "private",
                  content: importedContent,
                  status: "published",
                  knowledge_type: "article",
                  library_id: databaseFolderId,
                  created_by_user_id: userId,
                  updated_by_user_id: userId,
                  summary: article.description,
                  confidence:
                    article.confidence,
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
          }

          const articleDocumentLogs: KnowledgeImportExecutionLog["documents"] =
            [];

          for (const importFile of articleFiles) {
            const createdKnowledgeFile =
              await tx.knowledge_files.create({
                data: {
                  knowledge_source_id:
                    persistedArticle.id,
                  file_name:
                    importFile.file_name,
                  file_type:
                    importFile.mime_type,
                  file_size:
                    importFile.file_size,
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
              articleId:
                persistedArticle.id,
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

          createdArticles.push({
            proposalArticleId: article.id,
            action: article.action,
            existingArticleId:
              article.existingArticleId,
            databaseArticleId:
              persistedArticle.id,
            title:
              persistedArticle.title,
            description:
              persistedArticle.description ?? "",
            proposalFolderId:
              article.folderId,
            databaseFolderId:
              persistedArticle.library_id ??
              knowledgeImport.library_id,
            confidence:
              article.confidence,
            documentIds:
              article.documentIds,
            knowledgeFileIds:
              articleDocumentLogs.map(
                (document) =>
                  document.knowledgeFileId,
              ),
          });
        }

        const completedAt = new Date();

        const executionLog: KnowledgeImportExecutionLog =
          {
            version:
              "knowledge-import-confirm-v1",

            importId,
            status: "completed",

            startedAt:
              startedAt.toISOString(),
            completedAt:
              completedAt.toISOString(),
            durationMs:
              completedAt.getTime() -
              startedAt.getTime(),

            targetLibrary: {
              id: knowledgeImport
                .knowledge_libraries.id,
              name: knowledgeImport
                .knowledge_libraries.name,
            },

            userId,
            companyId:
              knowledgeImport.company_id,

summary: {
  foldersCreated:
    createdFolders.length,

  articlesCreated:
    createdArticles.filter(
      (article) =>
        article.action === "create",
    ).length,

  articlesUpdated:
    createdArticles.filter(
      (article) =>
        article.action === "update",
    ).length,

  documentsCreated:
    createdDocuments.length,

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
            articles: createdArticles,
            documents: createdDocuments,

            proposalSnapshot: proposal,
          };

          const afterSnapshot =
  await createKnowledgeStatusSnapshot(tx, userId);

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

await tx.knowledge_events.create({
  data: {
    company_id: knowledgeImport.company_id,
    user_id: userId,
    library_id: knowledgeImport.library_id,

    action: "knowledge.import.completed",

    title: "Importación completada",

    description: `${createdDocuments.length} documentos · ${createdArticles.length} artículos · ${createdFolders.length} carpetas`,

    metadata: {
      ...executionLog,

      snapshots: {
        capturedAt: completedAt.toISOString(),
        before: beforeSnapshot,
        after: afterSnapshot,
      },
    } as unknown as Prisma.InputJsonValue,
  },
});

        return executionLog;
      },
      {
        maxWait: 10_000,
        timeout: 120_000,
      },
    );

    for (const article of result.articles) {
        await analyzeKnowledgeSource(
            article.databaseArticleId,
        );
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