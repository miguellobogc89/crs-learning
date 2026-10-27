import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { knowledgeLibraryWriteWhere } from "@/lib/knowledge/access-control";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";
import { EXTRACTOR_UPLOAD_TYPE } from "@/lib/knowledge/intake/extractor/contract";
import type { TargetedResult } from "@/lib/knowledge/intake/targeted/contract";
import { RECONCILIATION_REVISION, type ReconciliationState } from "@/lib/knowledge/intake/reconciliation/contract";
import { reconcile } from "@/lib/knowledge/intake/reconciliation/process";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ importId: string }> };
type Payload = { resultado?: TargetedResult | { module?: string }; conciliacion?: ReconciliationState; [key: string]: unknown };
async function find(context: Context) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
  const { importId } = await context.params;
  const batch = await prisma.knowledge_imports.findFirst({ where: { id: importId, owner_user_id: session.user.id, upload_type: EXTRACTOR_UPLOAD_TYPE,
    knowledge_libraries: knowledgeLibraryWriteWhere(session.user.id, activeWorkspace.id) },
    select: { id: true, status: true, proposal_json: true, knowledge_libraries: { select: { workspace_id: true } } } });
  // Records are looked up in the workspace that owns the batch's library (the active one for legacy libraries).
  return batch && { ...batch, workspaceId: batch.knowledge_libraries.workspace_id ?? activeWorkspace.id };
}
/** A result of an older revision is recomputed (no AI involved: only reads of the workspace's records). */
function status(state: ReconciliationState | undefined) {
  if (!state || (state.status === "completed" && state.revision !== RECONCILIATION_REVISION)) return "pending";
  return state.status;
}
export async function GET(_request: Request, context: Context) {
  const batch = await find(context);
  if (!batch) return NextResponse.json({ error: "Lote no encontrado" }, { status: 404 });
  const state = (batch.proposal_json as Payload | null)?.conciliacion;
  const estado = status(state);
  return NextResponse.json({ fase: "conciliacion", estado, error: estado === "error" ? state?.error ?? null : null,
    resultado: estado === "completed" ? state?.resultado ?? null : null });
}
/** Runs inline: deterministic and read-only on Engine records; only this batch's checkpoint is written. */
export async function POST(_request: Request, context: Context) {
  const batch = await find(context);
  if (!batch) return NextResponse.json({ error: "Lote no encontrado" }, { status: 404 });
  const payload = batch.proposal_json as Payload | null;
  if (batch.status !== "intake_completed" || payload?.resultado?.module !== "targeted_extraction") {
    return NextResponse.json({ error: "La conciliación necesita una extracción dirigida completa" }, { status: 409 });
  }
  if (status(payload.conciliacion) === "completed") return NextResponse.json({ estado: "completed" });
  let state: ReconciliationState;
  try {
    const resultado = await reconcile(batch.id, batch.workspaceId, payload.resultado as TargetedResult);
    state = { status: "completed", revision: RECONCILIATION_REVISION, lease: new Date().toISOString(), resultado };
  } catch (error) {
    state = { status: "error", revision: RECONCILIATION_REVISION, lease: new Date().toISOString(), error: error instanceof Error ? error.message : "Error al conciliar" };
  }
  const next = JSON.parse(JSON.stringify({ ...payload, conciliacion: state }));
  const saved = await prisma.knowledge_imports.updateMany({ where: { id: batch.id, status: "intake_completed", proposal_json: { equals: batch.proposal_json as Prisma.InputJsonValue } },
    data: { proposal_json: next as Prisma.InputJsonValue, updated_at: new Date() } });
  if (saved.count !== 1) return NextResponse.json({ error: "El lote cambió; actualiza su estado" }, { status: 409 });
  return NextResponse.json({ estado: state.status });
}
