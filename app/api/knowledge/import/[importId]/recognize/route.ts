import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ importId: string }> };

// Controlled first stage only. Reads extracted text and recognizes document
// structure deterministically. No AI, schema creation or Engine writes.
export async function POST(_request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "No autorizado" }, { status: 401 });
  const { importId } = await context.params;
  const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
  const imported = await prisma.knowledge_imports.findFirst({
    where: {
      id: importId,
      owner_user_id: session.user.id,
      knowledge_libraries: { workspace_id: activeWorkspace.id },
    },
    select: {
      knowledge_import_files: {
        select: { id: true, file_name: true, extracted_text: true },
      },
    },
  });
  if (!imported) return Response.json({ error: "Importación no encontrada" }, { status: 404 });
  const files = imported.knowledge_import_files.map(file => {
    const text = file.extracted_text ?? "";
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const delimitedLines = lines.filter(line => /\t|\s\|\s|;/.test(line)).length;
    const numericLines = lines.filter(line => /\d+(?:[.,]\d+)?\s*(?:kg|g|ml|l|ud|%)(?:\s|$)/i.test(line)).length;
    const headings = lines.filter(line => line.length < 90 && (
      /^[A-ZÁÉÍÓÚÜÑ\d\s()\-.,/]{4,}$/.test(line) ||
      /^(?:\d+(?:\.\d+)*[.)]?\s+)?[\p{Lu}][\p{L}\s-]{3,50}:$/u.test(line)
    )).length;
    return {
      id: file.id,
      fileName: file.file_name,
      sourceChars: text.length,
      lines: lines.length,
      delimitedLines,
      numericLines,
      headings,
      hasStructuredEvidence: delimitedLines + numericLines >= 3,
      status: text.trim() ? "completed" as const : "error" as const,
      error: text.trim() ? null : "No hay texto extraído para reconocer el documento",
    };
  });
  return Response.json({
    stage: "recognition",
    status: files.every(file => file.status === "completed") ? "completed" : "completed_with_issues",
    files,
    writesPerformed: false,
    nextStagesExecuted: false,
  });
}
