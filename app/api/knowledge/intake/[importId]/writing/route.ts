import { Prisma } from "@prisma/client";
import { refreshIntakeAlerts } from "@/lib/knowledge/intake/alerts/service";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { knowledgeLibraryWriteWhere } from "@/lib/knowledge/access-control";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";
import { EXTRACTOR_UPLOAD_TYPE } from "@/lib/knowledge/intake/extractor/contract";
import type { TargetedResult } from "@/lib/knowledge/intake/targeted/contract";
import { RECONCILIATION_REVISION, type ReconciliationState } from "@/lib/knowledge/intake/reconciliation/contract";
import { buildWritePlan, MANUAL_JOIN, WRITER_REVISION, type DecisionValue as Decision } from "@/lib/knowledge/intake/writer/plan";
import { commitWritePlan, type WriteResult } from "@/lib/knowledge/intake/writer/commit";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
type Context = { params: Promise<{ importId: string }> };
type WritingState = { status: "completed" | "error"; revision: number; at: string; resultado?: WriteResult; error?: string; decisiones?: Record<string, Decision> };
type Payload = { resultado?: TargetedResult | { module?: string }; conciliacion?: ReconciliationState; escritura?: WritingState; [key: string]: unknown };

async function find(context: Context) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
  const { importId } = await context.params;
  const batch = await prisma.knowledge_imports.findFirst({ where: { id: importId, owner_user_id: session.user.id, upload_type: EXTRACTOR_UPLOAD_TYPE,
    knowledge_libraries: knowledgeLibraryWriteWhere(session.user.id, activeWorkspace.id) },
    select: { id: true, status: true, proposal_json: true, knowledge_libraries: { select: { workspace_id: true } } } });
  return batch && { ...batch, userId: session.user.id, workspaceId: batch.knowledge_libraries.workspace_id ?? activeWorkspace.id };
}
/** The plan needs a completed targeted extraction and a reconciliation of the current revision. */
function ready(payload: Payload | null) {
  const reconciliation = payload?.conciliacion;
  return payload?.resultado?.module === "targeted_extraction" && reconciliation?.status === "completed" && reconciliation.revision === RECONCILIATION_REVISION && reconciliation.resultado
    ? { extraction: payload.resultado as TargetedResult, reconciliation: reconciliation.resultado } : null;
}

/** Saved result, or the plan that WOULD be written (never written by a GET). Writing always needs a person. */
export async function GET(_request: Request, context: Context) {
  const batch = await find(context);
  if (!batch) return NextResponse.json({ error: "Lote no encontrado" }, { status: 404 });
  const payload = batch.proposal_json as Payload | null;
  const state = payload?.escritura;
  if (state?.status === "completed") return NextResponse.json({ fase: "escritura", estado: "completed", resultado: state.resultado });
  const inputs = ready(payload);
  if (!inputs) return NextResponse.json({ fase: "escritura", estado: "blocked", error: "Falta la conciliación actual del lote" });
  return NextResponse.json({ fase: "escritura", estado: state?.status === "error" ? "error" : "pending", error: state?.error ?? null,
    plan: buildWritePlan(inputs.extraction, inputs.reconciliation, state?.decisiones ?? {}) });
}

/** Body: { decisiones: { [ref]: "unir" | "tal_cual" | "omitir" } }. Writes once; a saved batch is never written again. */
export async function POST(request: Request, context: Context) {
  const batch = await find(context);
  if (!batch) return NextResponse.json({ error: "Lote no encontrado" }, { status: 404 });
  const payload = batch.proposal_json as Payload | null;
  if (batch.status !== "intake_completed") return NextResponse.json({ error: "El lote no está completo" }, { status: 409 });
  if (payload?.escritura?.status === "completed") return NextResponse.json({ estado: "completed" });
  const inputs = ready(payload);
  if (!inputs) return NextResponse.json({ error: "Falta la conciliación actual del lote" }, { status: 409 });
  const body = await request.json().catch(() => ({})) as { decisiones?: Record<string, Decision> };
  const decisiones = Object.fromEntries(Object.entries(body.decisiones ?? {}).filter(([, d]) => d === "unir" || d === "tal_cual" || d === "omitir" || (typeof d === "string" && MANUAL_JOIN.test(d))));
  const plan = buildWritePlan(inputs.extraction, inputs.reconciliation, decisiones);
  if (plan.resumen.bloqueados) return NextResponse.json({ error: `Faltan ${plan.resumen.bloqueados} decisión(es)`, plan }, { status: 409 });
  try {
    const resultado = await prisma.$transaction(async tx => {
      // Claim the batch first (exact previous payload): a second click or another tab cannot write it twice.
      const claim = JSON.parse(JSON.stringify({ ...payload, escritura: { status: "completed", revision: WRITER_REVISION, at: new Date().toISOString(), decisiones } }));
      const claimed = await tx.knowledge_imports.updateMany({ where: { id: batch.id, status: "intake_completed", proposal_json: { equals: batch.proposal_json as Prisma.InputJsonValue } },
        data: { proposal_json: claim, updated_at: new Date() } });
      if (claimed.count !== 1) throw new Error("El lote cambió mientras se guardaba; vuelve a intentarlo");
      const written = await commitWritePlan(tx, { workspaceId: batch.workspaceId, userId: batch.userId, batchId: batch.id, plan, revision: WRITER_REVISION });
      await tx.knowledge_imports.update({ where: { id: batch.id }, data: { proposal_json: { ...claim, escritura: { ...claim.escritura, resultado: written } } as Prisma.InputJsonValue, updated_at: new Date() } });
      return written;
    }, { timeout: 120_000, maxWait: 15_000 });
    refreshIntakeAlerts(batch.workspaceId);
    return NextResponse.json({ estado: "completed", resultado });
  } catch (error) {
    // Nothing was written (the transaction rolled back); the error and the decisions are kept for the next try.
    const message = error instanceof Error ? error.message : "No se pudo guardar";
    const next = JSON.parse(JSON.stringify({ ...payload, escritura: { status: "error", revision: WRITER_REVISION, at: new Date().toISOString(), error: message, decisiones } }));
    await prisma.knowledge_imports.updateMany({ where: { id: batch.id, proposal_json: { equals: batch.proposal_json as Prisma.InputJsonValue } }, data: { proposal_json: next, updated_at: new Date() } });
    refreshIntakeAlerts(batch.workspaceId);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
