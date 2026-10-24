import { auth } from "@/auth";
import { previewKnowledgeEngine } from "@/lib/engine/knowledge-engine-import.service";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
type Context = { params: Promise<{ importId: string }> };

/** Read-only with respect to Engine schemas and records: stores a reviewable plan. */
export async function POST(request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "No autorizado" }, { status: 401 });
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json({ error: "Origen no permitido" }, { status: 403 });
  const { importId } = await context.params;
  try {
    const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
    const result = await previewKnowledgeEngine({
      importId, userId: session.user.id, workspaceId: activeWorkspace.id,
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo preparar Engine.";
    console.error("[knowledge-engine-preview]", error);
    return Response.json({ error: message }, { status: 409 });
  }
}
