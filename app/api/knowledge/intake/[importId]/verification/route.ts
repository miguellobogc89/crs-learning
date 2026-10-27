import { Prisma } from "@prisma/client";
import { after, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { knowledgeLibraryWriteWhere } from "@/lib/knowledge/access-control";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";
import { EXTRACTOR_UPLOAD_TYPE } from "@/lib/knowledge/intake/extractor/contract";
import { VERIFIER_REVISION } from "@/lib/knowledge/intake/verifier/contract";
import { runVerification, type VerifiableIntake } from "@/lib/knowledge/intake/verifier/process";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const LEASE_MS = 360_000;
type Context = { params: Promise<{ importId: string }> };
async function find(context: Context) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
  const { importId } = await context.params;
  return prisma.knowledge_imports.findFirst({ where: { id: importId, owner_user_id: session.user.id, upload_type: EXTRACTOR_UPLOAD_TYPE,
    knowledge_libraries: knowledgeLibraryWriteWhere(session.user.id, activeWorkspace.id) }, select: { id: true, status: true, proposal_json: true } });
}
/** A report from an older comparison revision is recomputed from the stored readings (no new OCR call). */
function status(state: VerifiableIntake["verificacion"]) {
  if (!state) return "pending";
  if (state.status === "completed" && state.revision !== VERIFIER_REVISION) return "pending";
  if (state.status === "running" && Date.now() - Date.parse(state.lease) > LEASE_MS) return "pending";
  return state.status;
}
export async function GET(_request: Request, context: Context) {
  const batch = await find(context);
  if (!batch) return NextResponse.json({ error: "Lote no encontrado" }, { status: 404 });
  const state = (batch.proposal_json as VerifiableIntake | null)?.verificacion;
  const estado = status(state);
  return NextResponse.json({ fase: "verificacion", estado, error: estado === "error" ? state?.error ?? null : null,
    resultado: estado === "completed" ? state?.resultado ?? null : null });
}
export async function POST(_request: Request, context: Context) {
  const batch = await find(context);
  if (!batch) return NextResponse.json({ error: "Lote no encontrado" }, { status: 404 });
  const payload = batch.proposal_json as VerifiableIntake | null;
  if (batch.status !== "intake_completed" || payload?.resultado?.module !== "document_extractor") return NextResponse.json({ error: "Completa primero la lectura del lote" }, { status: 409 });
  const estado = status(payload.verificacion);
  if (estado === "completed" || estado === "running") return NextResponse.json({ estado }, { status: estado === "running" ? 202 : 200 });
  const lease = new Date().toISOString();
  const next = JSON.parse(JSON.stringify({ ...payload, verificacion: { status: "running", revision: VERIFIER_REVISION, lease, referencias: payload.verificacion?.referencias ?? [] } })) as VerifiableIntake;
  const claimed = await prisma.knowledge_imports.updateMany({ where: { id: batch.id, status: "intake_completed", proposal_json: { equals: batch.proposal_json as Prisma.InputJsonValue } },
    data: { proposal_json: next as unknown as Prisma.InputJsonValue, updated_at: new Date() } });
  if (claimed.count !== 1) return NextResponse.json({ error: "El lote cambió; actualiza su estado" }, { status: 409 });
  after(() => runVerification(batch.id, next, lease));
  return NextResponse.json({ estado: "running" }, { status: 202 });
}
