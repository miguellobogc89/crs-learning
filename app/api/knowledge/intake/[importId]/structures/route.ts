import { Prisma } from "@prisma/client";
import { after, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { knowledgeLibraryWriteWhere } from "@/lib/knowledge/access-control";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";
import { DISCOVERY_REVISION, discoverIntakeStructures, type StoredIntake } from "@/lib/knowledge/intake/structures/discover";
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
  return NextResponse.json({ estado: state?.status === "completed" && state.revision !== DISCOVERY_REVISION ? "pending" : state?.status ?? "pending", resultado: state?.revision === DISCOVERY_REVISION ? state?.result ?? null : null, error: state?.error ?? null, excludeCatalogKeys: state?.excludeCatalogKeys ?? [],
    recuperable: state?.status === "running" && Date.now()-Date.parse(state.lease) > 360000 });
}
export async function POST(_request: Request, context: Context) {
  const found = await authorized(context);
  if (!found) return NextResponse.json({ error: "Lote no encontrado" }, { status: 404 });
  const { batch, workspaceId } = found;
  const payload = batch.proposal_json as StoredIntake | null;
  if (batch.status !== "intake_completed" || payload?.resultado?.version !== 2) return NextResponse.json({ error: "Completa primero identificación y clasificación" }, { status: 409 });
  let options: { excludeCatalogKeys?: string[]; rerun?: boolean } = {};
  const text = await _request.text();
  try {
    const value: unknown = text.trim() ? JSON.parse(text) : {};
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    options = value;
    if (options.excludeCatalogKeys !== undefined && (!Array.isArray(options.excludeCatalogKeys) || options.excludeCatalogKeys.length > 20 ||
        !options.excludeCatalogKeys.every(k => typeof k === "string" && /^[a-z][a-z0-9_]*$/.test(k)))) throw new Error();
    if (options.rerun !== undefined && typeof options.rerun !== "boolean") throw new Error();
  } catch { return NextResponse.json({ error: "Opciones de prueba inválidas" }, { status: 400 }); }
  const excludeCatalogKeys = [...new Set(options.excludeCatalogKeys ?? [])].sort();
  const current = payload.structureDiscovery;
  if (current?.status === "completed" && current.revision === DISCOVERY_REVISION && !options.rerun && JSON.stringify(current.excludeCatalogKeys ?? []) === JSON.stringify(excludeCatalogKeys)) return NextResponse.json({ estado: "completed" });
  if (current?.status === "running" && Date.now()-Date.parse(current.lease) < 360000) return NextResponse.json({ estado: "running" }, { status: 202 });
  const lease = new Date().toISOString();
  const next = JSON.parse(JSON.stringify({ ...payload, structureDiscovery: { ...current, status: "running", revision: DISCOVERY_REVISION, excludeCatalogKeys, lease, result: undefined, error: undefined } })) as StoredIntake;
  const claimed = await prisma.knowledge_imports.updateMany({ where: { id: batch.id, status: "intake_completed", proposal_json: { equals: batch.proposal_json as Prisma.InputJsonValue } }, data: { proposal_json: next as unknown as Prisma.InputJsonValue, updated_at: new Date() } });
  if (claimed.count !== 1) return NextResponse.json({ error: "El lote cambió; actualiza su estado" }, { status: 409 });
  after(() => discoverIntakeStructures(batch.id, workspaceId, next, lease));
  return NextResponse.json({ estado: "running" }, { status: 202 });
}
