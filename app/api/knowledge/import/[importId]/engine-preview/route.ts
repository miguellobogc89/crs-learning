import { auth } from "@/auth";
import { previewKnowledgeEngine } from "@/lib/engine/knowledge-engine-import.service";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
type Context = {
  params: Promise<{
    importId: string;
  }>;
};
/** Read-only with respect to Engine schemas and records: stores a reviewable plan. */
export async function POST(request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "No autorizado" }, { status: 401 });
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json({ error: "Origen no permitido" }, { status: 403 });
  const { importId } = await context.params;
  try {
    const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
    const scope = { importId, userId: session.user.id, workspaceId: activeWorkspace.id };
    if (!request.headers.get("accept")?.includes("application/x-ndjson")) {
      return Response.json(await previewKnowledgeEngine(scope), { headers: { "Cache-Control": "no-store" } });
    }
    const encoder = new TextEncoder();
    let closed = false;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let message = "Preparando la revisión de Engine";
        const send = (event: unknown) => {
          if (!closed)
            controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        };
        const started = Date.now();
        const progress = () => send({ type: "progress", progress: { step: "preparing", progressPercentage: 0, message: message + ` · ${Math.round((Date.now() - started) / 1000)} s` } });
        const heartbeat = setInterval(progress, 5000);
        try {
          progress();
          const result = await previewKnowledgeEngine({ ...scope, onProgress: next => { message = next; progress(); } });
          send({ type: "completed", result });
        }
        catch (error) {
          console.error("[knowledge-engine-preview]", error);
          send({ type: "error", error: error instanceof Error ? error.message : "No se pudo preparar Engine." });
        }
        finally {
          clearInterval(heartbeat);
          if (!closed) {
            closed = true;
            controller.close();
          }
        }
      },
      cancel() { closed = true; },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
  }
  catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo preparar Engine.";
    console.error("[knowledge-engine-preview]", error);
    return Response.json({ error: message }, { status: 409 });
  }
}
