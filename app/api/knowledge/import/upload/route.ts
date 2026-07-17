// app/api/knowledge/import/upload/route.ts
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_IMPORT_SIZE = 150 * 1024 * 1024; // 150 MB

const ALLOWED_MODES = new Set(["files", "folder", "zip"]);

function sanitizeFileName(fileName: string) {
  const baseName = path.basename(fileName);

  return baseName
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeRelativePath(relativePath: string, fallbackName: string) {
  const normalized = relativePath
    .replaceAll("\\", "/")
    .split("/")
    .filter(
      (segment) =>
        segment &&
        segment !== "." &&
        segment !== "..",
    )
    .map((segment) => sanitizeFileName(segment))
    .filter(Boolean)
    .join("/");

  return normalized || fallbackName;
}

function parseRelativePaths(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) {
    return [] as string[];
  }

  try {
    const parsed: unknown = JSON.parse(value);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map((item) =>
      typeof item === "string" ? item : "",
    );
  } catch {
    return [];
  }
}

export async function POST(request: Request) {
  let importId: string | null = null;
  let importDirectory: string | null = null;

  try {
    const session = await auth();

    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json(
        {
          error: "No autorizado",
        },
        {
          status: 401,
        },
      );
    }

    const formData = await request.formData();

    const libraryIdEntry = formData.get("libraryId");
    const modeEntry = formData.get("mode");

    const libraryId =
      typeof libraryIdEntry === "string"
        ? libraryIdEntry.trim()
        : "";

    const mode =
      typeof modeEntry === "string"
        ? modeEntry.trim()
        : "";

    if (!libraryId) {
      return NextResponse.json(
        {
          error: "Falta la carpeta de destino.",
        },
        {
          status: 400,
        },
      );
    }

    if (!ALLOWED_MODES.has(mode)) {
      return NextResponse.json(
        {
          error: "El tipo de importación no es válido.",
        },
        {
          status: 400,
        },
      );
    }

    const files = formData
      .getAll("files")
      .filter((entry): entry is File => entry instanceof File);

    if (files.length === 0) {
      return NextResponse.json(
        {
          error: "No se ha recibido ningún archivo.",
        },
        {
          status: 400,
        },
      );
    }

    const totalSize = files.reduce(
      (total, file) => total + file.size,
      0,
    );

    if (totalSize > MAX_IMPORT_SIZE) {
      return NextResponse.json(
        {
          error:
            "La importación supera el límite máximo de 150 MB.",
        },
        {
          status: 413,
        },
      );
    }

    const user = await prisma.users.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        company_id: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        {
          error: "No se ha encontrado el usuario.",
        },
        {
          status: 404,
        },
      );
    }

    const library = await prisma.knowledge_libraries.findFirst({
      where: {
        id: libraryId,
        OR: [
          {
            owner_user_id: user.id,
          },
          ...(user.company_id
            ? [
                {
                  company_id: user.company_id,
                },
              ]
            : []),
        ],
      },
      select: {
        id: true,
      },
    });

    if (!library) {
      return NextResponse.json(
        {
          error:
            "La carpeta no existe o no tienes acceso a ella.",
        },
        {
          status: 403,
        },
      );
    }

    const relativePaths = parseRelativePaths(
      formData.get("relativePaths"),
    );

    const originalName =
      mode === "zip"
        ? files[0]?.name ?? null
        : files.length === 1
          ? files[0].name
          : `${files.length} archivos`;

  const knowledgeImport =
  await prisma.knowledge_imports.create({
    data: {
      library_id: library.id,
      owner_user_id: user.id,
      company_id: user.company_id,
      status: "uploading",
      upload_type: mode,
      original_name: originalName,
      total_files: files.length,
      total_size: totalSize,
    },
    select: {
      id: true,
    },
  });

const createdImportId = knowledgeImport.id;

importId = createdImportId;

importDirectory = path.join(
  process.cwd(),
  "public",
  "uploads",
  "knowledge-imports",
  createdImportId,
);

await mkdir(importDirectory, {
  recursive: true,
});

const uploadedFiles: Array<{
  import_id: string;
  file_name: string;
  relative_path: string;
  mime_type: string | null;
  file_size: number;
  storage_path: string;
  status: string;
}> = [];

for (const [index, file] of files.entries()) {
  const safeFileName =
    sanitizeFileName(file.name) ||
    `archivo-${index + 1}`;

  const relativePath = sanitizeRelativePath(
    relativePaths[index] || file.name,
    safeFileName,
  );

  const storedFileName = `${String(index + 1).padStart(
    4,
    "0",
  )}-${safeFileName}`;

  const absoluteStoragePath = path.join(
    importDirectory,
    storedFileName,
  );

  const buffer = Buffer.from(await file.arrayBuffer());

  await writeFile(absoluteStoragePath, buffer);

  uploadedFiles.push({
    import_id: createdImportId,
    file_name: safeFileName,
    relative_path: relativePath,
    mime_type: file.type || null,
    file_size: file.size,
    storage_path: `/uploads/knowledge-imports/${createdImportId}/${storedFileName}`,
    status: "uploaded",
  });
}

await prisma.$transaction([
  prisma.knowledge_import_files.createMany({
    data: uploadedFiles,
  }),

  prisma.knowledge_imports.update({
    where: {
      id: createdImportId,
    },
    data: {
      status: "uploaded",
      updated_at: new Date(),
    },
  }),
]);

return NextResponse.json(
  {
    importId: createdImportId,
    status: "uploaded",
    mode,
    fileCount: files.length,
    totalSize,
  },
  {
    status: 201,
  },
);

    
  } catch (error) {
    console.error("Knowledge import upload error:", error);

    if (importDirectory) {
      await rm(importDirectory, {
        recursive: true,
        force: true,
      }).catch(() => undefined);
    }

    if (importId) {
      await prisma.knowledge_imports
        .update({
          where: {
            id: importId,
          },
          data: {
            status: "failed",
            error_message:
              error instanceof Error
                ? error.message
                : "Error desconocido durante la subida.",
            updated_at: new Date(),
          },
        })
        .catch(() => undefined);
    }

    return NextResponse.json(
      {
        error: "No se ha podido completar la importación.",
      },
      {
        status: 500,
      },
    );
  }
}