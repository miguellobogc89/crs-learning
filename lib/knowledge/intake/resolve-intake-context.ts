// lib/knowledge/intake/resolve-intake-context.ts

import { prisma } from "@/lib/prisma";
import type { KnowledgeIntakeContext } from "./types";

export type ResolvedKnowledgeIntakeContext = {
  libraryId: string;
  folderId: string | null;
  articleId: string | null;
  companyId: string | null;
};

export async function resolveKnowledgeIntakeContext(
  context: KnowledgeIntakeContext,
): Promise<ResolvedKnowledgeIntakeContext> {
  switch (context.entryPoint) {
    case "library": {
      const library = await prisma.knowledge_libraries.findUnique({
        where: {
          id: context.libraryId,
        },
        select: {
          id: true,
          parent_id: true,
          company_id: true,
        },
      });

      if (!library) {
        throw new Error("No se ha encontrado la biblioteca.");
      }

      return {
        libraryId: library.id,
        folderId: library.parent_id ? library.id : null,
        articleId: null,
        companyId: library.company_id,
      };
    }

    case "folder": {
      const [library, folder] = await Promise.all([
        prisma.knowledge_libraries.findUnique({
          where: {
            id: context.libraryId,
          },
          select: {
            id: true,
            company_id: true,
          },
        }),
        prisma.knowledge_libraries.findUnique({
          where: {
            id: context.folderId,
          },
          select: {
            id: true,
            parent_id: true,
            company_id: true,
          },
        }),
      ]);

      if (!library) {
        throw new Error("No se ha encontrado la biblioteca.");
      }

      if (!folder) {
        throw new Error("No se ha encontrado la carpeta.");
      }

      if (!folder.parent_id) {
        throw new Error(
          "El identificador recibido corresponde a una biblioteca raíz, no a una carpeta.",
        );
      }

      if (
        library.company_id &&
        folder.company_id &&
        library.company_id !== folder.company_id
      ) {
        throw new Error(
          "La carpeta no pertenece a la misma empresa que la biblioteca.",
        );
      }

      return {
        libraryId: library.id,
        folderId: folder.id,
        articleId: null,
        companyId: library.company_id ?? folder.company_id,
      };
    }

    case "article": {
      const article = await prisma.knowledge_sources.findUnique({
        where: {
          id: context.articleId,
        },
        select: {
          id: true,
          library_id: true,
          company_id: true,
        },
      });

      if (!article) {
        throw new Error("No se ha encontrado el artículo.");
      }

      if (!article.library_id) {
        throw new Error(
          "El artículo no está asociado a ninguna biblioteca o carpeta.",
        );
      }

      if (article.library_id !== context.libraryId) {
        throw new Error(
          "El artículo no pertenece a la biblioteca o carpeta indicada.",
        );
      }

      const location = await prisma.knowledge_libraries.findUnique({
        where: {
          id: article.library_id,
        },
        select: {
          id: true,
          parent_id: true,
          company_id: true,
        },
      });

      if (!location) {
        throw new Error(
          "No se ha encontrado la ubicación del artículo.",
        );
      }

      return {
        libraryId: location.parent_id
          ? context.libraryId
          : location.id,
        folderId: location.parent_id ? location.id : null,
        articleId: article.id,
        companyId: article.company_id ?? location.company_id,
      };
    }

    case "knowledge_root": {
      const library = await prisma.knowledge_libraries.findFirst({
        where: {
          company_id: context.companyId,
          parent_id: null,
        },
        orderBy: [
          {
            position: "asc",
          },
          {
            created_at: "asc",
          },
        ],
        select: {
          id: true,
          company_id: true,
        },
      });

      if (!library) {
        throw new Error(
          "La empresa todavía no tiene una biblioteca raíz.",
        );
      }

      return {
        libraryId: library.id,
        folderId: null,
        articleId: null,
        companyId: library.company_id,
      };
    }

    default: {
      return assertNever(context);
    }
  }
}

function assertNever(value: never): never {
  throw new Error(
    `Contexto de importación no soportado: ${JSON.stringify(value)}`,
  );
}