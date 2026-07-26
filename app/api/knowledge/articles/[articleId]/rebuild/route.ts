// app/api/knowledge/articles/[articleId]/rebuild/route.ts
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { generateArticleContent } from "@/lib/knowledge/import/generate-article-content";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{
    articleId: string;
  }>;
};

export async function POST(
  _request: Request,
  context: RouteContext,
) {
  try {
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

    const { articleId } = await context.params;

    const article =
      await prisma.knowledge_sources.findFirst({
        where: {
          id: articleId,
          owner_user_id: session.user.id,
        },
        select: {
          id: true,
          title: true,
          description: true,
          knowledge_type: true,
          knowledge_files: {
            select: {
              id: true,
              file_name: true,
              file_type: true,
              extracted_text: true,
            },
          },
        },
      });

    if (!article) {
      return NextResponse.json(
        {
          error: "Artículo no encontrado",
        },
        {
          status: 404,
        },
      );
    }

    const documents = article.knowledge_files
      .filter(
        (file) =>
          typeof file.extracted_text === "string" &&
          file.extracted_text.trim().length > 0,
      )
      .map((file) => ({
        id: file.id,
        fileName: file.file_name,
        fileType: file.file_type,
        extractedText: file.extracted_text!,
      }));

    if (documents.length === 0) {
      return NextResponse.json(
        {
          error:
            "El artículo no tiene documentos con texto extraído",
        },
        {
          status: 400,
        },
      );
    }

    await prisma.knowledge_sources.update({
      where: {
        id: article.id,
      },
      data: {
        status: "processing",
        updated_by_user_id: session.user.id,
        updated_at: new Date(),
      },
    });

    try {
const generatedContent =
  await generateArticleContent({
    title: article.title,
    description: article.description ?? "",
    existingContent: null,
    files: article.knowledge_files
      .filter(
        (file) =>
          typeof file.extracted_text === "string" &&
          file.extracted_text.trim().length > 0,
      )
      .map((file) => ({
        id: file.id,
        fileName: file.file_name,
        extractedText: file.extracted_text!,
      })),
  });

await prisma.knowledge_sources.update({
  where: {
    id: article.id,
  },
  data: {
    content: generatedContent,
    status: "ready",
    updated_by_user_id: session.user.id,
    updated_at: new Date(),
  },
});
    } catch (error) {
      await prisma.knowledge_sources.update({
        where: {
          id: article.id,
        },
        data: {
          status: "error",
          updated_at: new Date(),
        },
      });

      throw error;
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error(
      "[KNOWLEDGE_REBUILD_ARTICLE_ERROR]",
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se ha podido reconstruir el artículo",
      },
      {
        status: 500,
      },
    );
  }
}