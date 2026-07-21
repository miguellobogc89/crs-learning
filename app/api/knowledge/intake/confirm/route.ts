// app/api/knowledge/intake/confirm/route.ts

import {
  mkdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { extractFileText } from "@/lib/knowledge/extract-file-text";
import { isAcceptedKnowledgeFileType } from "@/lib/knowledge/file-types";
import type {
  ConfirmKnowledgeIntakeResult,
  KnowledgeIntakeCreatedArticle,
  KnowledgeIntakeDocumentDecision,
  KnowledgeIntakeIgnoredDocument,
  KnowledgeIntakeProposal,
  KnowledgeIntakeUpdatedArticle,
} from "@/lib/knowledge/intake/types";
import { prisma } from "@/lib/prisma";
import { analyzeKnowledgeSource } from "@/lib/services/knowledge-analysis.service";

export const runtime = "nodejs";
export const maxDuration = 300;

type PreparedFile = {
  documentId: string;
  file: File;
  extractedText: string;
  storagePath: string;
  absolutePath: string;
};

function parseJson<T>(
  value: FormDataEntryValue | null,
  errorMessage: string,
): T {
  if (typeof value !== "string") {
    throw new Error(errorMessage);
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error(errorMessage);
  }
}

function validateProposal(
  proposal: KnowledgeIntakeProposal,
) {
  if (
    !proposal ||
    !Array.isArray(proposal.decisions) ||
    typeof proposal.libraryId !== "string"
  ) {
    throw new Error(
      "La propuesta de incorporación no es válida",
    );
  }
}

function createStoredFileName(
  file: File,
  documentId: string,
) {
  const safeFileName = file.name
    .replaceAll(" ", "_")
    .replace(/[^a-zA-Z0-9._-]/g, "");

  return [
    "intake",
    documentId,
    Date.now(),
    crypto.randomUUID(),
    safeFileName,
  ].join("-");
}

async function removePreparedFiles(
  preparedFiles: PreparedFile[],
) {
  await Promise.allSettled(
    preparedFiles.map((preparedFile) =>
      unlink(preparedFile.absolutePath),
    ),
  );
}

async function validateArticleDestination({
  articleId,
  userId,
}: {
  articleId: string;
  userId: string;
}) {
  const article =
    await prisma.knowledge_sources.findFirst({
      where: {
        id: articleId,
        owner_user_id: userId,
      },
      select: {
        id: true,
        title: true,
        library_id: true,
      },
    });

  if (!article) {
    throw new Error(
      "Uno de los artículos de destino ya no existe",
    );
  }

  if (!article.library_id) {
    throw new Error(
      `El artículo ${article.title} no pertenece a ninguna carpeta`,
    );
  }

  return {
    id: article.id,
    title: article.title,
    libraryId: article.library_id,
  };
}

async function validateFolderDestination({
  folderId,
  userId,
}: {
  folderId: string;
  userId: string;
}) {
  const folder =
    await prisma.knowledge_libraries.findFirst({
      where: {
        id: folderId,
        owner_user_id: userId,
      },
      select: {
        id: true,
        name: true,
        company_id: true,
      },
    });

  if (!folder) {
    throw new Error(
      "Una de las carpetas de destino ya no existe",
    );
  }

  return folder;
}

function getIgnoredReason(
  decision: KnowledgeIntakeDocumentDecision,
): KnowledgeIntakeIgnoredDocument["reason"] {
  if (
    decision.decision ===
    "exact_duplicate"
  ) {
    return "exact_duplicate";
  }

  return "possible_duplicate";
}

function isActionableDecision(
  decision: KnowledgeIntakeDocumentDecision,
): decision is Exclude<
  KnowledgeIntakeDocumentDecision,
  {
    decision:
      | "exact_duplicate"
      | "possible_duplicate";
  }
> {
  return (
    decision.decision !== "exact_duplicate" &&
    decision.decision !== "possible_duplicate"
  );
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json(
      {
        error: "No autenticado",
      },
      {
        status: 401,
      },
    );
  }

  const preparedFiles: PreparedFile[] = [];

  try {
    const formData = await request.formData();

    const libraryId = String(
      formData.get("libraryId") ?? "",
    ).trim();

    const proposal =
      parseJson<KnowledgeIntakeProposal>(
        formData.get("proposal"),
        "La propuesta de incorporación no es válida",
      );

    const documentIds = parseJson<string[]>(
      formData.get("documentIds"),
      "Los identificadores de documentos no son válidos",
    );

    const files = formData
      .getAll("files")
      .filter(
        (value): value is File =>
          value instanceof File,
      );

    validateProposal(proposal);

    if (!libraryId) {
      throw new Error(
        "No se ha indicado la biblioteca de destino",
      );
    }

    if (proposal.libraryId !== libraryId) {
      throw new Error(
        "La propuesta no pertenece a la biblioteca seleccionada",
      );
    }

    if (
      files.length === 0 ||
      files.length !== documentIds.length
    ) {
      throw new Error(
        "No se han podido relacionar los documentos de la propuesta",
      );
    }

    const targetLibrary =
      await prisma.knowledge_libraries.findFirst({
        where: {
          id: libraryId,
          owner_user_id: session.user.id,
        },
        select: {
          id: true,
          name: true,
          company_id: true,
        },
      });

    if (!targetLibrary) {
      throw new Error(
        "La biblioteca de destino ya no existe",
      );
    }

    const fileByDocumentId = new Map<
      string,
      File
    >();

    for (
      let index = 0;
      index < files.length;
      index += 1
    ) {
      const file = files[index];
      const documentId = documentIds[index];

      if (
        !documentId ||
        fileByDocumentId.has(documentId)
      ) {
        throw new Error(
          "Los identificadores de documentos están duplicados o incompletos",
        );
      }

      if (!isAcceptedKnowledgeFileType(file)) {
        throw new Error(
          `El archivo ${file.name} tiene un formato no admitido`,
        );
      }

      fileByDocumentId.set(
        documentId,
        file,
      );
    }

    const decisionByDocumentId = new Map<
      string,
      KnowledgeIntakeDocumentDecision
    >();

    for (const decision of proposal.decisions) {
      if (
        decisionByDocumentId.has(
          decision.documentId,
        )
      ) {
        throw new Error(
          `El documento ${decision.documentName} aparece más de una vez en la propuesta`,
        );
      }

      if (
        !fileByDocumentId.has(
          decision.documentId,
        )
      ) {
        throw new Error(
          `No se ha recibido el archivo ${decision.documentName}`,
        );
      }

      decisionByDocumentId.set(
        decision.documentId,
        decision,
      );
    }

const actionableDecisions =
  proposal.decisions.filter(
    isActionableDecision,
  );

    const uploadDirectory = path.join(
      process.cwd(),
      "public",
      "uploads",
      "knowledge",
    );

    await mkdir(uploadDirectory, {
      recursive: true,
    });

    for (const decision of actionableDecisions) {
      const file = fileByDocumentId.get(
        decision.documentId,
      );

      if (!file) {
        throw new Error(
          `No se ha encontrado el archivo ${decision.documentName}`,
        );
      }

      const extractedText =
        await extractFileText(file);

      if (extractedText.trim().length < 20) {
        throw new Error(
          `No se ha podido extraer texto suficiente de ${file.name}`,
        );
      }

      const storedFileName =
        createStoredFileName(
          file,
          decision.documentId,
        );

      const absolutePath = path.join(
        uploadDirectory,
        storedFileName,
      );

      const storagePath =
        `/uploads/knowledge/${storedFileName}`;

      const bytes = await file.arrayBuffer();

      await writeFile(
        absolutePath,
        Buffer.from(bytes),
      );

      preparedFiles.push({
        documentId: decision.documentId,
        file,
        extractedText,
        storagePath,
        absolutePath,
      });
    }

    const preparedFileByDocumentId =
      new Map(
        preparedFiles.map((preparedFile) => [
          preparedFile.documentId,
          preparedFile,
        ]),
      );

    const createdArticles: KnowledgeIntakeCreatedArticle[] =
      [];

    const updatedArticlesMap =
      new Map<
        string,
        KnowledgeIntakeUpdatedArticle
      >();

    const ignoredDocuments: KnowledgeIntakeIgnoredDocument[] =
      proposal.decisions
        .filter(
          (
            decision,
          ): decision is KnowledgeIntakeDocumentDecision & {
            decision:
              | "exact_duplicate"
              | "possible_duplicate";
          } =>
            decision.decision ===
              "exact_duplicate" ||
            decision.decision ===
              "possible_duplicate",
        )
        .map((decision) => ({
          documentId: decision.documentId,
          documentName:
            decision.documentName,
          reason: getIgnoredReason(decision),
        }));

    const affectedArticleIds =
      new Set<string>();

    await prisma.$transaction(async (tx) => {
      for (const decision of actionableDecisions) {

        const preparedFile =
          preparedFileByDocumentId.get(
            decision.documentId,
          );

        if (!preparedFile) {
          throw new Error(
            `No se ha preparado el archivo ${decision.documentName}`,
          );
        }

        if (
          decision.decision ===
            "new_version" ||
          decision.decision ===
            "enrich_existing_article"
        ) {
          const articleId =
            decision.destination.articleId;

          const article =
            await validateArticleDestination({
              articleId,
              userId: session.user.id,
            });

          await tx.knowledge_files.create({
            data: {
              knowledge_source_id:
                article.id,
              file_name:
                preparedFile.file.name,
              file_type:
                preparedFile.file.type ||
                null,
              file_size:
                preparedFile.file.size,
              storage_path:
                preparedFile.storagePath,
              extracted_text:
                preparedFile.extractedText,
              status: "ready",
              uploaded_by_user_id:
                session.user.id,
            },
          });

          await tx.knowledge_sources.update({
            where: {
              id: article.id,
            },
            data: {
              status: "processing",
              updated_by_user_id:
                session.user.id,
              updated_at: new Date(),
            },
          });

          const currentUpdatedArticle =
            updatedArticlesMap.get(article.id);

          if (currentUpdatedArticle) {
            currentUpdatedArticle.documentIds.push(
              decision.documentId,
            );
          } else {
            updatedArticlesMap.set(
              article.id,
              {
                id: article.id,
                title: article.title,
                documentIds: [
                  decision.documentId,
                ],
              },
            );
          }

          affectedArticleIds.add(article.id);

          continue;
        }

        let destinationFolderId: string;

        if (
          decision.decision ===
          "create_article_in_existing_folder"
        ) {
          const folderId =
            decision.destination.folderId;


          const folder =
            await validateFolderDestination({
              folderId,
              userId: session.user.id,
            });

          destinationFolderId = folder.id;
        } else {
          const newFolderName =
            decision.destination.newFolderName?.trim();

          if (!newFolderName) {
            throw new Error(
              `No se ha indicado el nombre de la nueva carpeta para ${decision.documentName}`,
            );
          }

          const existingFolder =
            await tx.knowledge_libraries.findFirst({
              where: {
                owner_user_id:
                  session.user.id,
                parent_id: libraryId,
                name: newFolderName,
              },
              select: {
                id: true,
              },
            });

          if (existingFolder) {
            destinationFolderId =
              existingFolder.id;
          } else {
            const createdFolder =
              await tx.knowledge_libraries.create({
                data: {
                  owner_user_id:
                    session.user.id,
                  parent_id: libraryId,
                  name: newFolderName,
                  position: 0,
                  company_id:
                    targetLibrary.company_id,
                  visibility: "restricted",
                  created_by_user_id:
                    session.user.id,
                  updated_by_user_id:
                    session.user.id,
                },
                select: {
                  id: true,
                },
              });

            destinationFolderId =
              createdFolder.id;
          }
        }

        const articleTitle =
          decision.destination.articleTitle.trim() ||
          decision.title.trim() ||
          preparedFile.file.name.replace(
            /\.[^/.]+$/,
            "",
          );

        const createdArticle =
          await tx.knowledge_sources.create({
            data: {
              owner_user_id:
                session.user.id,
              created_by_user_id:
                session.user.id,
              updated_by_user_id:
                session.user.id,
              library_id:
                destinationFolderId,
              title: articleTitle,
              description:
                decision.summary,
              visibility: "private",
              knowledge_type: "unknown",
              content: "",
              status: "processing",
              summary: decision.summary,
              confidence:
                decision.confidence,
              company_id:
                targetLibrary.company_id,
            },
            select: {
              id: true,
              title: true,
              library_id: true,
            },
          });

        await tx.knowledge_files.create({
          data: {
            knowledge_source_id:
              createdArticle.id,
            file_name:
              preparedFile.file.name,
            file_type:
              preparedFile.file.type ||
              null,
            file_size:
              preparedFile.file.size,
            storage_path:
              preparedFile.storagePath,
            extracted_text:
              preparedFile.extractedText,
            status: "ready",
            uploaded_by_user_id:
              session.user.id,
          },
        });

        createdArticles.push({
          id: createdArticle.id,
          title: createdArticle.title,
          libraryId:
            createdArticle.library_id ??
            destinationFolderId,
          documentIds: [
            decision.documentId,
          ],
        });

        affectedArticleIds.add(
          createdArticle.id,
        );
      }
    });

    for (const articleId of affectedArticleIds) {
      await analyzeKnowledgeSource(articleId);
    }

    const updatedArticles = Array.from(
      updatedArticlesMap.values(),
    );

    const result: ConfirmKnowledgeIntakeResult =
      {
        success: true,
        status: "completed",
        summary: {
          createdArticles:
            createdArticles.length,
          updatedArticles:
            updatedArticles.length,
          ignoredDocuments:
            ignoredDocuments.length,
          attachedDocuments:
            actionableDecisions.length,
        },
        createdArticles,
        updatedArticles,
        ignoredDocuments,
      };

    return NextResponse.json(result);
  } catch (error) {
    await removePreparedFiles(
      preparedFiles,
    );

    const message =
      error instanceof Error
        ? error.message
        : "No se ha podido confirmar la incorporación";

    console.error(
      "KNOWLEDGE INTAKE CONFIRM ERROR",
      error,
    );

    return NextResponse.json(
      {
        error: message,
      },
      {
        status: 500,
      },
    );
  }
}