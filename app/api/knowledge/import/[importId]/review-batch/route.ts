import { auth } from "@/auth";
import { reviewKnowledgeImportBatch } from "@/lib/knowledge/import/review-import-batch.service";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request, context: { params: Promise<{ importId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "No autorizado" }, { status: 401 });
  const { importId } = await context.params;
  const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
  const scope = { importId, userId: session.user.id, workspaceId: activeWorkspace.id };
  // Keep the JSON response for existing consumers; the modal requests NDJSON.
  if (!request.headers.get("accept")?.includes("application/x-ndjson")) {
    try { return Response.json({ map: await reviewKnowledgeImportBatch(scope) }); }
    catch (error) { return Response.json({ error: error instanceof Error ? error.message : "No se ha podido revisar el lote" }, { status: 409 }); }
  }
  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      function send(event: unknown) {
        if (!closed) controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      }
      try {
        const map = await reviewKnowledgeImportBatch({ ...scope,
          onProgress: progress => send({ type: "progress", progress }),
        });
        send({ type: "completed", result: { map } });
      } catch (error) {
        send({ type: "error", error: error instanceof Error ? error.message : "No se ha podido revisar el lote" });
      } finally {
        if (!closed) { closed = true; controller.close(); }
      }
    },
    cancel() { closed = true; },
  });
  return new Response(stream, { headers: {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no",
  } });
}
