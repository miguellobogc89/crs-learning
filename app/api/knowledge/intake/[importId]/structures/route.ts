import { Prisma } from "@prisma/client";
import { after, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { knowledgeLibraryWriteWhere } from "@/lib/knowledge/access-control";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";
import { discoverIntakeStructures, type StoredIntake } from "@/lib/knowledge/intake/structures/discover";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
type Context = { params: Promise<{ importId: string }> };
async function authorized(context: Context) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
  const { importId } = await context.params;
  const batch = await prisma.knowledge_imports.findFirst({ where: { id: importId, upload_type: "intake-v1", owner_user_id: session.user.id, knowledge_libraries: knowledgeLibraryWriteWhere(session.user.id, activeWorkspace.id) }, select: { id: true, status: true, proposal_json: true } });
  return batch ? { batch, workspaceId: activeWorkspace.id } : null;
}
export async function GET(_request: Request, context: Context) {
  const found = await authorized(context);
  if (!found) return NextResponse.json({ error: "Lote no encontrado" }, { status: 404 });
  const state = (found.batch.proposal_json as StoredIntake | null)?.structureDiscovery;
  return NextResponse.json({ estado: state?.status ?? "pending", resultado: state?.result ?? null, error: state?.error ?? null,
    recuperable: state?.status === "running" && Date.now()-Date.parse(state.lease) > 360000 });
}
export async function POST(_request: Request, context: Context) {
  const found = await authorized(context);
  if (!found) return NextResponse.json({ error: "Lote no encontrado" }, { status: 404 });
  const { batch, workspaceId } = found;
  const payload = batch.proposal_json as StoredIntake | null;
  if (batch.status !== "intake_completed" || payload?.resultado?.version !== 2) return NextResponse.json({ error: "Completa primero identificación y clasificación" }, { status: 409 });
  const current = payload.structureDiscovery;
  if (current?.status === "completed") return NextResponse.json({ estado: "completed" });
  if (current?.status === "running" && Date.now()-Date.parse(current.lease) < 360000) return NextResponse.json({ estado: "running" }, { status: 202 });
  const lease = new Date().toISOString();
  const next = JSON.parse(JSON.stringify({ ...payload, structureDiscovery: { ...current, status: "running", lease, error: undefined } })) as StoredIntake;
  const claimed = await prisma.knowledge_imports.updateMany({ where: { id: batch.id, status: "intake_completed", proposal_json: { equals: batch.proposal_json as Prisma.InputJsonValue } }, data: { proposal_json: next as unknown as Prisma.InputJsonValue, updated_at: new Date() } });
  if (claimed.count !== 1) return NextResponse.json({ error: "El lote cambió; actualiza su estado" }, { status: 409 });
  after(() => discoverIntakeStructures(batch.id, workspaceId, next, lease));
  return NextResponse.json({ estado: "running" }, { status: 202 });
}
