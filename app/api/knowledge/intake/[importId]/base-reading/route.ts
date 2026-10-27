import { Prisma } from "@prisma/client";
import { after, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { knowledgeLibraryWriteWhere } from "@/lib/knowledge/access-control";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";
import { EXTRACTOR_UPLOAD_TYPE } from "@/lib/knowledge/intake/extractor/contract";
import { BASE_READING_REVISION, type BaseReadingResult } from "@/lib/knowledge/intake/base-reading/contract";
import { runBaseReading, type BaseReadableIntake } from "@/lib/knowledge/intake/base-reading/process";
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
function status(state: BaseReadableIntake["lecturaBase"]) {
  if (!state) return "pending";
  if (state.status === "completed" && state.revision !== BASE_READING_REVISION) return "pending";
  if (state.status === "running" && Date.now() - Date.parse(state.lease) > LEASE_MS) return "pending";
  return state.status;
}
/** Text blocks only: positioned words stay server-side (the verification exposes them for diagnosis). */
const summary = (result: BaseReadingResult) => ({ ...result, archivos: result.archivos.map(({ referencias, ...file }) =>
  ({ ...file, fuentes: referencias.map(r => r.fuente) })) });
export async function GET(_request: Request, context: Context) {
  const batch = await find(context);
  if (!batch) return NextResponse.json({ error: "Lote no encontrado" }, { status: 404 });
  const state = (batch.proposal_json as BaseReadableIntake | null)?.lecturaBase;
  const estado = status(state);
  return NextResponse.json({ fase: "lectura_base", estado, error: estado === "error" ? state?.error ?? null : null,
    resultado: estado === "completed" && state?.resultado ? summary(state.resultado) : null });
}
export async function POST(_request: Request, context: Context) {
  const batch = await find(context);
  if (!batch) return NextResponse.json({ error: "Lote no encontrado" }, { status: 404 });
  // Modules write the same batch payload with optimistic checks: never while the vision reading is running.
  if (batch.status === "intake_running") return NextResponse.json({ error: "Espera a que termine la lectura en curso" }, { status: 409 });
  const payload = (batch.proposal_json ?? {}) as BaseReadableIntake;
  const estado = status(payload.lecturaBase);
  if (estado === "completed" || estado === "running") return NextResponse.json({ estado }, { status: estado === "running" ? 202 : 200 });
  const lease = new Date().toISOString();
  const keep = payload.lecturaBase?.revision === BASE_READING_REVISION ? payload.lecturaBase.archivos ?? [] : [];
  const next = JSON.parse(JSON.stringify({ ...payload, lecturaBase: { status: "running", revision: BASE_READING_REVISION, lease, archivos: keep } })) as BaseReadableIntake;
  const claimed = await prisma.knowledge_imports.updateMany({ where: { id: batch.id, status: { not: "intake_running" }, proposal_json: { equals: batch.proposal_json as Prisma.InputJsonValue } },
    data: { proposal_json: next as unknown as Prisma.InputJsonValue, updated_at: new Date() } });
  if (claimed.count !== 1) return NextResponse.json({ error: "El lote cambió; actualiza su estado" }, { status: 409 });
  after(() => runBaseReading(batch.id, next, lease));
  return NextResponse.json({ estado: "running" }, { status: 202 });
}
