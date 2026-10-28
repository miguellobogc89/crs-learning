import { Prisma } from "@prisma/client";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { EXTRACTOR_UPLOAD_TYPE } from "../extractor/contract";
import { RECONCILIATION_REVISION, type ReconciliationResult } from "../reconciliation/contract";
import type { TargetedResult } from "../targeted/contract";
import { buildWritePlan, type DecisionValue } from "../writer/plan";
import { templateOverview } from "../templates/service";
import { computeAlerts, hasNew, type Alert, type BatchSummary } from "./compute";

/**
 * Keeps the inbox of a workspace's owners and admins in line with its imports: one notification per alert (updated
 * in place), back to unread only when something new appears, deleted when solved. Best effort: it never breaks the
 * action that triggered it.
 */
const PREFIX = "intake.";

async function batchSummaries(workspaceId: string): Promise<BatchSummary[]> {
  const rows = await prisma.$queryRaw<{ id: string; status: string; error: string | null; nombre: string | null; archivos: number; conciliacion: string | null; revision: number | null; escritura: string | null }[]>(Prisma.sql`
    SELECT k.id::text AS id, k.status, k.error_message AS error, k.original_name AS nombre, k.total_files AS archivos,
      k.proposal_json->'conciliacion'->>'status' AS conciliacion, (k.proposal_json->'conciliacion'->>'revision')::int AS revision,
      k.proposal_json->'escritura'->>'status' AS escritura
    FROM public.knowledge_imports k JOIN public.knowledge_libraries l ON l.id = k.library_id AND l.workspace_id = ${workspaceId}::uuid
    WHERE k.upload_type = ${EXTRACTOR_UPLOAD_TYPE} AND coalesce(k.proposal_json->'escritura'->>'status', '') <> 'completed'`);
  const out: BatchSummary[] = [];
  for (const r of rows) {
    const nombre = r.nombre ?? `Lote ${r.id.slice(0, 8)}`;
    if (r.status === "intake_error") { out.push({ id: r.id, nombre, estado: "error", bloqueados: 0, error: r.error, archivos: r.archivos }); continue; }
    if (r.status !== "intake_completed" || r.conciliacion !== "completed" || r.revision !== RECONCILIATION_REVISION) { out.push({ id: r.id, nombre, estado: "otro", bloqueados: 0, error: null, archivos: r.archivos }); continue; }
    // Waiting to be saved: how many decisions its plan still needs (the same plan the person sees).
    const batch = await prisma.knowledge_imports.findUnique({ where: { id: r.id }, select: { proposal_json: true } });
    const p = batch?.proposal_json as { resultado?: TargetedResult; conciliacion?: { resultado?: ReconciliationResult }; escritura?: { decisiones?: Record<string, DecisionValue> } } | null;
    let bloqueados = 0;
    try { if (p?.resultado && p.conciliacion?.resultado) bloqueados = buildWritePlan(p.resultado, p.conciliacion.resultado, p.escritura?.decisiones ?? {}).resumen.bloqueados; }
    catch { bloqueados = 0; }
    out.push({ id: r.id, nombre, estado: "por_guardar", bloqueados, error: null, archivos: r.archivos });
  }
  return out;
}

async function recipients(workspaceId: string): Promise<string[]> {
  const [workspace, members] = await Promise.all([
    prisma.workspaces.findUnique({ where: { id: workspaceId }, select: { owner_user_id: true } }),
    prisma.workspace_members.findMany({ where: { workspace_id: workspaceId, status: "active", role: { in: ["owner", "admin"] } }, select: { user_id: true } }),
  ]);
  return [...new Set([workspace?.owner_user_id, ...members.map((m: { user_id: string }) => m.user_id)].filter((x): x is string => !!x))];
}

export async function currentAlerts(workspaceId: string): Promise<Alert[]> {
  const [batches, overview, drive] = await Promise.all([
    batchSummaries(workspaceId),
    templateOverview(workspaceId),
    prisma.workspace_connections.findFirst({ where: { workspace_id: workspaceId, provider: "google_drive" }, select: { id: true } }).catch(() => null),
  ]);
  return computeAlerts({ batches, groups: overview.grupos, hasDrive: !!drive });
}

export async function syncIntakeAlerts(workspaceId: string): Promise<void> {
  const [alerts, users, workspace] = await Promise.all([currentAlerts(workspaceId), recipients(workspaceId),
    prisma.workspaces.findUnique({ where: { id: workspaceId }, select: { name: true } })]);
  for (const userId of users) {
    const existing = await prisma.notifications.findMany({ where: { user_id: userId, type: { startsWith: PREFIX }, metadata: { path: ["workspace_id"], equals: workspaceId } },
      select: { id: true, metadata: true, read_at: true } });
    type Note = { id: string; metadata: unknown; read_at: Date | null };
    const byKey = new Map<string, Note>((existing as Note[]).map(n => [String((n.metadata as { key?: string })?.key), n]));
    for (const a of alerts) {
      const metadata = { key: a.key, workspace_id: workspaceId, count: a.count, items: a.items.slice(0, 500) } as Prisma.InputJsonValue;
      const body = workspace?.name ? `${a.body} · ${workspace.name}` : a.body;
      const found = byKey.get(a.key);
      if (!found) { await prisma.notifications.create({ data: { user_id: userId, type: a.type, title: a.title, body, href: a.href, metadata } }); continue; }
      const fresh = hasNew((found.metadata as { items?: string[] })?.items, a.items);
      await prisma.notifications.update({ where: { id: found.id }, data: { type: a.type, title: a.title, body, href: a.href, metadata,
        ...(fresh ? { read_at: null, created_at: new Date() } : {}) } });
      byKey.delete(a.key);
    }
    // What is solved leaves the inbox.
    if (byKey.size) await prisma.notifications.deleteMany({ where: { id: { in: [...byKey.values()].map(n => n.id) } } });
  }
}

/** After the response (Next.js `after`): refreshes the alerts without delaying the action; errors are only logged. */
export function refreshIntakeAlerts(workspaceId: string) {
  const run = () => syncIntakeAlerts(workspaceId).catch(error => console.warn("[intake] alertas:", error instanceof Error ? error.message : error));
  try { after(run); } catch { void run(); }
}
