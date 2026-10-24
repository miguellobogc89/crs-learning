import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import OpenAI from "openai";
import { getKnowledgeImportModel } from "@/lib/ai/openai";
import { prisma } from "@/lib/prisma";
import {
  appendInventoryFile, emptyImportInventory,
  type ImportInventory, type InventoryDocument, type InventoryFile,
} from "@/lib/knowledge/import/build-import-map";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Context = { params: Promise<{ importId: string }> };

async function loadImport(importId: string, userId: string, workspaceId: string) {
  return prisma.knowledge_imports.findFirst({
    where: { id: importId, owner_user_id: userId, knowledge_libraries: { workspace_id: workspaceId } },
    select: {
      proposal_json: true, status: true, processing_status: true,
      knowledge_import_files: {
        select: { id: true, file_name: true, extracted_text: true, status: true, processing_status: true, error_message: true },
      },
    },
  });
}
function readMap(payload: unknown, importId: string): ImportInventory {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const map = (payload as Record<string, unknown>).globalImportMap;
    if (map && typeof map === "object" && (map as ImportInventory).version === 3 &&
      (map as ImportInventory).importId === importId) return map as ImportInventory;
  }
  return emptyImportInventory(importId);
}
function normal(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 120) : fallback;
}
function extractDocuments(
  raw: unknown,
  file: { id: string; file_name: string },
  lineCount: number,
): InventoryDocument[] {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { documents?: unknown }).documents)) {
    throw new Error("La IA no devolvió un inventario de documentos válido.");
  }
  const docs = (raw as { documents: unknown[] }).documents;
  if (!docs.length) throw new Error("La IA no ha podido identificar documentos; revisar el archivo.");
  if (docs.length > 150) throw new Error("Demasiados documentos detectados para una lectura inicial.");
  return docs.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error("Documento no válido.");
    const doc = item as Record<string, unknown>;
    const start = Number(doc.startLine);
    const end = Number(doc.endLine);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > lineCount) {
      throw new Error("La IA devolvió límites documentales no verificables.");
    }
    return {
      id: file.id + ":doc:" + (index + 1),
      fileId: file.id, fileName: file.file_name,
      type: normal(doc.type, "documento sin clasificar").toLowerCase(),
      category: normal(doc.category, "sin clasificar").toLowerCase(),
      title: normal(doc.title, "Documento " + (index + 1)),
      startLine: start, endLine: end,
      confidence: doc.confidence === "high" || doc.confidence === "medium" ? doc.confidence : "low",
    };
  });
}

/** Process ONE extracted file per request. The client queues files sequentially. */
export async function POST(request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "No autorizado" }, { status: 401 });
  const { importId } = await context.params;
  const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
  const imported = await loadImport(importId, session.user.id, activeWorkspace.id);
  if (!imported) return Response.json({ error: "Importación no encontrada" }, { status: 404 });
  if (imported.status !== "text_ready" || ["processing", "cancelled"].includes(imported.processing_status)) {
    return Response.json({ error: "La importación no está preparada para reconocer documentos" }, { status: 409 });
  }
  let body: { fileId?: string };
  try { body = await request.json(); } catch { return Response.json({ error: "Indica fileId en JSON" }, { status: 400 }); }
  if (!body.fileId) return Response.json({ error: "Falta fileId" }, { status: 400 });
  const file = imported.knowledge_import_files.find(item => item.id === body.fileId);
  if (!file) return Response.json({ error: "Archivo no encontrado en esta importación" }, { status: 404 });
  const text = file.extracted_text?.trim() ?? "";
  if (!text) return Response.json({ error: "El archivo todavía no tiene texto extraído" }, { status: 422 });
  if (!process.env.OPENAI_API_KEY) return Response.json({ error: "OPENAI_API_KEY no configurada" }, { status: 503 });

  const lines = text.split(/\r?\n/);
  // Keep original line numbers stable. If oversized, fail explicitly rather than silently skipping pages.
  if (text.length > 110000) return Response.json({ error: "Documento demasiado largo para el inventario rápido; requiere fragmentación por páginas." }, { status: 422 });
  // Reuse earlier semantic category names when they fit, instead of creating
  // "luz" and "electricidad" as separate categories across PDFs.
  const previousMap = readMap(imported.proposal_json, importId);
  const previousCategories = previousMap.summary.byCategory.map(item => item.category);
  const numbered = lines.map((line, i) => `${i + 1}: ${line}`).join("\n");
  let documents: InventoryDocument[];
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 48000, maxRetries: 0 });
    const completion = await client.chat.completions.create({
      model: getKnowledgeImportModel(),
      response_format: { type: "json_object" },
      max_completion_tokens: 3500,
      messages: [
        { role: "system", content: `Devuelve exclusivamente un objeto JSON con la clave "documents" (array).
Eres el clasificador documental de una empresa. Identifica CADA documento independiente dentro del archivo; una tabla, un desglose y una página adicional NO son documentos nuevos.
Examina el contenido antes que el nombre. Para cada documento devuelve:
- type: tipo concreto según contenido, no uses "procedimiento" como categoría por defecto.
- category: tema empresarial breve; reutiliza categorías anteriores semánticamente equivalentes.
- title, startLine, endLine, confidence: high|medium|low; límites de línea íntegros y verificables.
No propongas destinos, artículos, tablas ni registros en esta etapa. La revisión conjunta posterior comparará todos los archivos y decidirá los candidatos para Knowledge y Engine.

Conserva cada documento aunque el archivo contenga varios. No inventes fechas, categorías, límites, relaciones ni documentos. En caso de incertidumbre, explica la duda y usa confidence low.` },
        { role: "user", content: `Categorías anteriores: ${JSON.stringify(previousCategories)}
Archivo: ${file.file_name}
Contenido numerado:
${numbered}` },
      ],
    });
    const answer = completion.choices[0]?.message?.content;
    if (!answer) throw new Error("Respuesta vacía del modelo.");
    documents = extractDocuments(JSON.parse(answer), file, lines.length);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Fallo en reconocimiento IA" }, { status: 502 });
  }

  // Reload latest map after inference so completed earlier files are retained.
  const latest = await prisma.knowledge_imports.findUnique({ where: { id: importId }, select: { proposal_json: true } });
  const previous = latest?.proposal_json && typeof latest.proposal_json === "object" && !Array.isArray(latest.proposal_json)
    ? latest.proposal_json as Record<string, unknown> : {};
  const fileResult: InventoryFile = {
    fileId: file.id, fileName: file.file_name, sourceChars: text.length,
    status: "completed", documentIds: documents.map(doc => doc.id),
  };
  const map = appendInventoryFile(readMap(previous, importId), fileResult, documents);
  const eligible = imported.knowledge_import_files.filter(item => item.status !== "uploaded");
  map.status = map.files.filter(item => item.status === "completed").length >= eligible.length ? "completed" : "in_progress";
  const saved = await prisma.knowledge_imports.updateMany({
    where: { id: importId, status: "text_ready", processing_status: { notIn: ["cancelled", "processing"] },
      proposal_json: { equals: latest?.proposal_json ?? Prisma.DbNull } },
    data: { proposal_json: { ...previous, globalImportMap: map }, updated_at: new Date() },
  });
  if (saved.count !== 1) return Response.json({ error: "El lote cambió durante el reconocimiento" }, { status: 409 });
  return Response.json({ map, file: fileResult, documents, status: map.status, writesPerformed: false });
}

export async function GET(_request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "No autorizado" }, { status: 401 });
  const { importId } = await context.params;
  const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
  const imported = await loadImport(importId, session.user.id, activeWorkspace.id);
  if (!imported) return Response.json({ error: "Importación no encontrada" }, { status: 404 });
  return Response.json({ map: readMap(imported.proposal_json, importId) });
}
