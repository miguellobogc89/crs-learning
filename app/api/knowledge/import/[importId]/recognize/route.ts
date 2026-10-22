import { auth } from "@/auth";
import OpenAI from "openai";
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
      proposal_json: true,
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
function extractDocuments(raw: unknown, file: { id: string; file_name: string }, lineCount: number): InventoryDocument[] {
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
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 24000, maxRetries: 0 });
    const completion = await client.chat.completions.create({
      model: process.env.CRS_IMPORT_INVENTORY_MODEL || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      max_completion_tokens: 2000,
      messages: [
        { role: "system", content: `Devuelve exclusivamente JSON válido con la clave documents (array).
Eres un lector universal de documentos. Identifica CADA documento independiente dentro del archivo, no cada tabla o desglose.
Lee todas las líneas, considera encabezados, cambios de emisor, fechas, números, cierres y continuidad.
Para cada documento devuelve: type (factura, contrato, procedimiento, receta, informe u otro según contenido), category (concepto breve descubierto del contenido: electricidad, telefonía, productos, etc.; no uses lista fija), title (breve), startLine, endLine, confidence (high, medium, low).
Los límites son números de línea del texto proporcionado. Un documento puede contener muchas tablas.
No inventes documentos, categorías, números o relaciones. Si hay duda, utiliza sin clasificar y confidence low.
Incluye todos los documentos encontrados, incluso si hay varias facturas dentro de un PDF.
El nombre del archivo solo es contexto, no prueba. No extraigas filas, importes, tablas ni entidades.\nSi una categoría anterior coincide semánticamente con una categoría del archivo actual, reutiliza exactamente su nombre.` },
        { role: "user", content: `Categorías usadas en archivos anteriores (reutilízalas solo cuando correspondan): ${JSON.stringify(previousCategories)}\nInventario JSON del archivo ${file.file_name}. Texto completo con líneas numeradas:\n${numbered}` },
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
  await prisma.knowledge_imports.update({
    where: { id: importId }, data: { proposal_json: { ...previous, globalImportMap: map } },
  });
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
