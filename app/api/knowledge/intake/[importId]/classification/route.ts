import { Prisma } from "@prisma/client";
import { after, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { knowledgeLibraryWriteWhere } from "@/lib/knowledge/access-control";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";
import { EXTRACTOR_UPLOAD_TYPE } from "@/lib/knowledge/intake/extractor/contract";
import { CLASSIFIER_REVISION } from "@/lib/knowledge/intake/classifier/contract";
import { runClassification, type ClassifiableIntake } from "@/lib/knowledge/intake/classifier/process";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const LEASE_MS = 360_000;
type Context = { params: Promise<{ importId: string }> };
type Payload = ClassifiableIntake;
async function find(context: Context) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
  const { importId } = await context.params;
  return prisma.knowledge_imports.findFirst({ where: { id: importId, owner_user_id: session.user.id, upload_type: EXTRACTOR_UPLOAD_TYPE,
    knowledge_libraries: knowledgeLibraryWriteWhere(session.user.id, activeWorkspace.id) }, select: { id: true, status: true, proposal_json: true } });
}
function status(state: ClassifiableIntake["clasificacion"]) {
  if (!state) return "pending";
  if (state.status === "completed" && state.revision !== CLASSIFIER_REVISION) return "pending";
  if (state.status === "running" && Date.now() - Date.parse(state.lease) > LEASE_MS) return "pending";
  return state.status;
}
export async function GET(_request: Request, context: Context) {
  const batch = await find(context);
  if (!batch) return NextResponse.json({ error: "Lote no encontrado" }, { status: 404 });
  const state = (batch.proposal_json as Payload | null)?.clasificacion;
  const estado = status(state);
  return NextResponse.json({ fase: "clasificacion", estado, error: estado === "error" ? state?.error ?? null : null,
    resultado: estado === "completed" ? state?.resultado ?? null : null });
}
export async function POST(_request: Request, context: Context) {
  const batch = await find(context);
  if (!batch) return NextResponse.json({ error: "Lote no encontrado" }, { status: 404 });
  const payload = batch.proposal_json as Payload | null;
  if (payload?.lecturaBase?.status !== "completed") return NextResponse.json({ error: "Completa primero la lectura base del lote" }, { status: 409 });
  // Modules write the same batch payload with optimistic checks: they run one after another, never at once.
  if (batch.status === "intake_running") return NextResponse.json({ error: "Espera a que termine la lectura en curso" }, { status: 409 });
  const estado = status(payload.clasificacion);
  if (estado === "completed" || estado === "running") return NextResponse.json({ estado }, { status: estado === "running" ? 202 : 200 });
  const lease = new Date().toISOString();
  // Files classified under an older revision are classified again; same revision: continue after the last saved file.
  const keep = payload.clasificacion?.revision === CLASSIFIER_REVISION ? payload.clasificacion.archivos ?? [] : [];
  const next = JSON.parse(JSON.stringify({ ...payload, clasificacion: { status: "running", revision: CLASSIFIER_REVISION, lease, archivos: keep } })) as ClassifiableIntake;
  const claimed = await prisma.knowledge_imports.updateMany({ where: { id: batch.id, status: { not: "intake_running" }, proposal_json: { equals: batch.proposal_json as Prisma.InputJsonValue } },
    data: { proposal_json: next as unknown as Prisma.InputJsonValue, updated_at: new Date() } });
  if (claimed.count !== 1) return NextResponse.json({ error: "El lote cambió; actualiza su estado" }, { status: 409 });
  after(() => runClassification(batch.id, next, lease));
  return NextResponse.json({ estado: "running" }, { status: 202 });
}
