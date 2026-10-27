import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { uploadKnowledgeFile, deleteKnowledgeFile } from "@/lib/storage/knowledge-storage";
import { EXTRACTOR_UPLOAD_TYPE } from "./extractor/contract";
import { intakeFormatProblem, isIntakeImage, INTAKE_IMAGE_MAX_BYTES } from "./formats";

/**
 * Creates an intake batch (upload type v2) from documents already in memory: checks formats and sizes, stores the
 * originals and records each file with the SHA-256 of its content (used to skip duplicates). Shared by the manual
 * upload and the connectors, so a batch is identical whatever its origin. All-or-nothing: on failure nothing stays stored.
 */
export type IntakeDocument = { fileName: string; relativePath?: string; mimeType: string; content: Uint8Array };
export const PDF_MAX_BYTES = 20 * 1024 * 1024;
export const contentHash = (content: Uint8Array) => createHash("sha256").update(content).digest("hex");

/** Null when the document can enter the pipeline; otherwise why not, in plain words. */
export function documentProblem(fileName: string, size: number): string | null {
  const format = intakeFormatProblem(fileName);
  if (format) return format;
  if (isIntakeImage(fileName) && size > INTAKE_IMAGE_MAX_BYTES) return `${fileName}: cada imagen admite un máximo de 20 MB`;
  if (fileName.toLowerCase().endsWith(".pdf") && size > PDF_MAX_BYTES) return `${fileName}: cada PDF admite un máximo de 20 MB en extracción visual`;
  return null;
}

export async function createIntakeBatch(input: { libraryId: string; userId: string; documents: IntakeDocument[]; originalName?: string }): Promise<{ id: string; files: { id: string; hash: string; fileName: string }[] }> {
  const { documents } = input;
  if (!documents.length) throw new Error("No hay documentos compatibles");
  const problems = documents.map(d => documentProblem(d.fileName, d.content.byteLength)).filter((p): p is string => p !== null);
  if (problems.length) throw new Error(problems.join(" · "));
  const stored: string[] = [];
  try {
    const staged = [];
    for (const [index, doc] of documents.entries()) {
      const storage = await uploadKnowledgeFile(`knowledge/intake/${crypto.randomUUID()}`, Buffer.from(doc.content), doc.mimeType || "application/octet-stream");
      stored.push(storage);
      staged.push({ file_name: doc.fileName, relative_path: doc.relativePath ?? doc.fileName, mime_type: doc.mimeType, file_size: doc.content.byteLength,
        storage_path: storage, status: "uploaded", processing_order: index, content_hash: contentHash(doc.content) });
    }
    const batch = await prisma.knowledge_imports.create({ data: {
      library_id: input.libraryId, owner_user_id: input.userId, upload_type: EXTRACTOR_UPLOAD_TYPE, status: "intake_pending", total_files: staged.length,
      total_size: staged.reduce((n, f) => n + f.file_size, 0), proposal_json: { version: 1, archivos: [] }, knowledge_import_files: { create: staged },
      ...(input.originalName ? { original_name: input.originalName } : {}),
    }, select: { id: true, knowledge_import_files: { select: { id: true, content_hash: true, file_name: true }, orderBy: { processing_order: "asc" } } } });
    return { id: batch.id, files: batch.knowledge_import_files.map((f: { id: string; content_hash: string | null; file_name: string }) => ({ id: f.id, hash: f.content_hash!, fileName: f.file_name })) };
  } catch (error) {
    await Promise.allSettled(stored.map(deleteKnowledgeFile));
    throw error;
  }
}
