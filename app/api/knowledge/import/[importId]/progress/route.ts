// app/api/knowledge/import/[importId]/progress/route.ts

import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    importId: string;
  }>;
};

function getProgressPercentage(
  completedFiles: number,
  failedFiles: number,
  totalFiles: number,
) {
  if (totalFiles <= 0) {
    return 0;
  }

  const processedFiles =
    completedFiles + failedFiles;

  return Math.min(
    100,
    Math.round(
      (processedFiles / totalFiles) * 100,
    ),
  );
}

export async function GET(
  _request: Request,
  context: RouteContext,
) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json(
      {
        error: "No autorizado",
      },
      {
        status: 401,
      },
    );
  }

  const { importId } = await context.params;

  if (!importId) {
    return NextResponse.json(
      {
        error: "Importación no válida",
      },
      {
        status: 400,
      },
    );
  }

  const knowledgeImport =
    await prisma.knowledge_imports.findFirst({
      where: {
        id: importId,
        owner_user_id: session.user.id,
      },
      select: {
        id: true,
        status: true,
        processing_status: true,
        total_files: true,
        total_size: true,
        completed_files: true,
        failed_files: true,
        current_file_id: true,
        proposal_json: true,
        error_message: true,
        processing_started_at: true,
        processing_completed_at: true,
        completed_at: true,
        created_at: true,
        updated_at: true,
      },
    });

  if (!knowledgeImport) {
    return NextResponse.json(
      {
        error: "Importación no encontrada",
      },
      {
        status: 404,
      },
    );
  }

  const currentFile =
    knowledgeImport.current_file_id
      ? await prisma.knowledge_import_files.findFirst({
          where: {
            id: knowledgeImport.current_file_id,
            import_id: importId,
          },
          select: {
            id: true,
            file_name: true,
            relative_path: true,
            file_size: true,
            processing_order: true,
            processing_status: true,
            processing_step: true,
            started_at: true,
            completed_at: true,
            error_message: true,
          },
        })
      : null;

const files =
  await prisma.knowledge_import_files.findMany({
    where: {
      import_id: importId,
    },
    orderBy: [
      {
        processing_order: "asc",
      },
      {
        created_at: "asc",
      },
    ],
    select: {
      id: true,
      file_name: true,
      relative_path: true,
      file_size: true,
      status: true,
      processing_order: true,
      processing_status: true,
      processing_step: true,
      started_at: true,
      completed_at: true,
      error_message: true,
    },
  });

  const totalFiles =
    knowledgeImport.total_files ??
    files.length;

  const completedFiles =
    knowledgeImport.completed_files ?? 0;

  const failedFiles =
    knowledgeImport.failed_files ?? 0;

  const processedFiles =
    completedFiles + failedFiles;

  const progressPercentage =
    getProgressPercentage(
      completedFiles,
      failedFiles,
      totalFiles,
    );

  const isFinished =
    knowledgeImport.processing_status ===
      "completed" ||
    knowledgeImport.processing_status ===
      "error";

  const proposalReady =
    knowledgeImport.proposal_json !== null ||
    knowledgeImport.status ===
      "proposal_ready";

  return NextResponse.json({
    importId: knowledgeImport.id,

    status: knowledgeImport.status,
    processingStatus:
      knowledgeImport.processing_status ??
      "pending",

    totalFiles,
    completedFiles,
    failedFiles,
    processedFiles,
    pendingFiles: Math.max(
      totalFiles - processedFiles,
      0,
    ),

    totalSize:
      knowledgeImport.total_size ?? 0,

    progressPercentage,
    isFinished,
    proposalReady,

    currentFile: currentFile
      ? {
          id: currentFile.id,
          name: currentFile.file_name,
          relativePath:
            currentFile.relative_path,
          size: currentFile.file_size,
          processingOrder:
            currentFile.processing_order,
          processingStatus:
            currentFile.processing_status,
          processingStep:
            currentFile.processing_step,
          startedAt:
            currentFile.started_at,
          completedAt:
            currentFile.completed_at,
          error:
            currentFile.error_message,
        }
      : null,

    files: files.map((file) => ({
      id: file.id,
      name: file.file_name,
      relativePath:
        file.relative_path,
      size: file.file_size,
      status: file.status,
      processingOrder:
        file.processing_order,
      processingStatus:
        file.processing_status,
      processingStep:
        file.processing_step,
      startedAt: file.started_at,
      completedAt:
        file.completed_at,
      error: file.error_message,
    })),

    error:
      knowledgeImport.error_message,

    processingStartedAt:
      knowledgeImport.processing_started_at,

    processingCompletedAt:
      knowledgeImport.processing_completed_at,

    completedAt:
      knowledgeImport.completed_at,

    createdAt:
      knowledgeImport.created_at,

    updatedAt:
      knowledgeImport.updated_at,
  });
}