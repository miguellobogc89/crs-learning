import { auth } from "@/auth";
import {
  EnginePreviewConflictError, getKnowledgeEnginePreview, runKnowledgeEnginePreview,
} from "@/lib/engine/knowledge-preview/preview.service";
import type { EnginePreviewEvent, EnginePreviewRunMode } from "@/lib/engine/knowledge-preview/types";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
type Context = { params: Promise<{ importId: string }> };

async function scopeFor(context: Context) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const { importId } = await context.params;
  const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
  return { importId, userId: session.user.id, workspaceId: activeWorkspace.id };
}

/** Current preview state. Never calls the model. */
export async function GET(_request: Request, context: Context) {
  const scope = await scopeFor(context);
  if (!scope) return Response.json({ error: "No autorizado" }, { status: 401 });
  try {
    return Response.json(await getKnowledgeEnginePreview(scope), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo leer Engine." }, { status: 409 });
  }
}

/**
 * Runs (or continues) the preview and streams NDJSON events. Writes only the
 * preview checkpoint; never Engine schemas or records. Closing the request
 * stops the model calls in flight.
 */
export async function POST(request: Request, context: Context) {
  const scope = await scopeFor(context);
  if (!scope) return Response.json({ error: "No autorizado" }, { status: 401 });
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json({ error: "Origen no permitido" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { mode?: string; segmentId?: string };
  const mode: EnginePreviewRunMode = body.mode === "restart" || body.mode === "retry_document" ? body.mode : "continue";
  if (mode === "retry_document" && typeof body.segmentId !== "string")
    return Response.json({ error: "Indica el documento que quieres reintentar." }, { status: 400 });

  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort(), { once: true });
  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: EnginePreviewEvent | { type: "heartbeat"; seconds: number }) => {
        if (!closed) controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };
      const started = Date.now();
      // Keeps proxies from closing an idle connection during long model calls.
      const heartbeat = setInterval(() => send({ type: "heartbeat", seconds: Math.round((Date.now() - started) / 1000) }), 5000);
      try {
        const preview = await runKnowledgeEnginePreview({
          ...scope, mode, segmentId: body.segmentId, signal: abort.signal, onEvent: send,
        });
        send({ type: "completed", preview });
      } catch (error) {
        if (!(error instanceof EnginePreviewConflictError)) console.error("[knowledge-engine-preview]", error);
        const preview = await getKnowledgeEnginePreview(scope).catch(() => null);
        send({ type: "error", error: error instanceof Error ? error.message : "No se pudo analizar Engine.", preview });
      } finally {
        clearInterval(heartbeat);
        if (!closed) { closed = true; controller.close(); }
      }
    },
    cancel() { closed = true; abort.abort(); },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
  });
}
