import { auth } from "@/auth";
import { reviewKnowledgeImportBatch } from "@/lib/knowledge/import/review-import-batch.service";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(_request: Request, context: { params: Promise<{ importId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "No autorizado" }, { status: 401 });
  const { importId } = await context.params;
  const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
  try {
    const map = await reviewKnowledgeImportBatch({ importId, userId: session.user.id, workspaceId: activeWorkspace.id });
    return Response.json({ map });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se ha podido revisar el lote" }, { status: 409 });
  }
}
