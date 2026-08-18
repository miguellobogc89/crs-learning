// app/api/knowledge/files/[fileId]/reanalyze/route.ts

import { NextResponse } from "next/server";

import { auth } from "@/auth";
import {
  analyzeKnowledgeFile,
  toPrismaJson,
} from "@/lib/knowledge/file-analysis/analyze-file";
import {
  KNOWLEDGE_FILE_ANALYSIS_PROMPT_VERSION,
  KNOWLEDGE_FILE_ANALYSIS_SCHEMA_VERSION,
} from "@/lib/knowledge/file-analysis/types";
import { knowledgeSourceOwnerWhere } from "@/lib/knowledge/access-control";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RouteContext = {
  params: Promise<{
    fileId: string;
  }>;
};

function getErrorMessage(error: Error) {
  return error.message || "No se ha podido reanalizar el documento";
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

  const { fileId } = await context.params;

  if (!fileId) {
    return NextResponse.json(
      { error: "Documento no valido" },
      { status: 400 },
    );
  }

  const { activeWorkspace } = await getActiveWorkspaceContext(
    session.user.id,
  );

  const file = await prisma.knowledge_files.findFirst({
    where: {
      id: fileId,
      knowledge_sources: knowledgeSourceOwnerWhere(
        session.user.id,
        activeWorkspace.id,
      ),
    },
    select: {
      id: true,
      file_name: true,
      file_type: true,
      file_size: true,
      storage_path: true,
      extracted_text: true,
    },
  });

  if (!file) {
    return NextResponse.json(
      { error: "Documento no encontrado" },
      { status: 404 },
    );
  }

  const processingStartedAt = new Date();

  await prisma.knowledge_file_analysis.upsert({
    where: {
      knowledge_file_id: file.id,
    },
    create: {
      knowledge_file_id: file.id,
      status: "processing",
      schema_version:
        KNOWLEDGE_FILE_ANALYSIS_SCHEMA_VERSION,
      prompt_version:
        KNOWLEDGE_FILE_ANALYSIS_PROMPT_VERSION,
      error_message: null,
      updated_at: processingStartedAt,
    },
    update: {
      status: "processing",
      error_message: null,
      updated_at: processingStartedAt,
    },
  });

  try {
    const result = await analyzeKnowledgeFile(file);
    const saved =
      await prisma.knowledge_file_analysis.upsert({
        where: {
          knowledge_file_id: file.id,
        },
        create: {
          knowledge_file_id: file.id,
          status: "ready",
          analysis_json: toPrismaJson(
            result.analysis,
          ),
          schema_version:
            KNOWLEDGE_FILE_ANALYSIS_SCHEMA_VERSION,
          extractor:
            result.analysis.source.extractor,
          model: result.analysis.source.model,
          prompt_version:
            KNOWLEDGE_FILE_ANALYSIS_PROMPT_VERSION,
          file_hash:
            result.analysis.source.fileHash,
          tokens_input: result.tokensInput,
          tokens_output: result.tokensOutput,
          processing_ms:
            result.processingMs,
          error_message: null,
          updated_at: new Date(),
        },
        update: {
          status: "ready",
          analysis_json: toPrismaJson(
            result.analysis,
          ),
          schema_version:
            KNOWLEDGE_FILE_ANALYSIS_SCHEMA_VERSION,
          extractor:
            result.analysis.source.extractor,
          model: result.analysis.source.model,
          prompt_version:
            KNOWLEDGE_FILE_ANALYSIS_PROMPT_VERSION,
          file_hash:
            result.analysis.source.fileHash,
          tokens_input: result.tokensInput,
          tokens_output: result.tokensOutput,
          processing_ms:
            result.processingMs,
          error_message: null,
          updated_at: new Date(),
        },
      });

    return NextResponse.json({
      analysis: saved,
    });
  } catch (caughtError) {
    const error =
      caughtError instanceof Error
        ? caughtError
        : new Error(
            "No se ha podido reanalizar el documento",
          );
    const saved =
      await prisma.knowledge_file_analysis.update({
        where: {
          knowledge_file_id: file.id,
        },
        data: {
          status: "error",
          error_message:
            getErrorMessage(error),
          processing_ms:
            Date.now() -
            processingStartedAt.getTime(),
          updated_at: new Date(),
        },
      });

    return NextResponse.json(
      {
        error: getErrorMessage(error),
        analysis: saved,
      },
      { status: 500 },
    );
  }
}
