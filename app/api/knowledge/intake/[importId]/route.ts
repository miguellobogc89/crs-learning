import { NextResponse, after } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { knowledgeLibraryWriteWhere } from "@/lib/knowledge/access-control";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";
import { processExtractor, EXTRACTOR_UPLOAD_TYPE, type ExtractorState } from "@/lib/knowledge/intake/extractor/process";
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ importId: string }> };
async function find(context: Context) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
  const { importId } = await context.params;
  return prisma.knowledge_imports.findFirst({ where: { id: importId, owner_user_id: session.user.id, upload_type: EXTRACTOR_UPLOAD_TYPE, knowledge_libraries: knowledgeLibraryWriteWhere(session.user.id, activeWorkspace.id) },
    include: { knowledge_import_files: { select: { status: true } } } });
}
export async function GET(_request: Request, context: Context) {
  const batch = await find(context);
  if (!batch) return NextResponse.json({ error: "Lote no encontrado" }, { status: 404 });
  const state = batch.proposal_json as unknown as ExtractorState;
  return NextResponse.json({ loteId: batch.id, estado: batch.status, fase: "lectura", error: batch.error_message,
    resultado: batch.status === "intake_completed" ? state.resultado ?? null : null });
}
export async function POST(_request: Request, context: Context) {
  const batch = await find(context);
  if (!batch) return NextResponse.json({ error: "Lote no encontrado" }, { status: 404 });
  if (batch.status === "intake_completed") return NextResponse.json({ estado: batch.status });
  const lease = new Date();
  const claimed = await prisma.knowledge_imports.updateMany({ where: { id: batch.id, OR: [ { status: { in: ["intake_pending", "intake_error"] } }, { status: "intake_running", processing_started_at: { lt: new Date(Date.now()-360000) } } ] },
    data: { status: "intake_running", processing_started_at: lease, error_message: null } });
  if (claimed.count) after(() => processExtractor(batch.id, lease));
  return NextResponse.json({ estado: "intake_running" }, { status: 202 });
}
