import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadAnalyticsData, type AnalyticsData } from "@/lib/analytics/data";
import { allTableKeys, buildTable, type Table } from "@/lib/analytics/compute";
import { planChanges, type EngineType, type Operation, type Plan, type PlanContext } from "./plan";
import { ApplyError, applyActions, undoActions, type ApplyLink, type ApplyTable, type UndoLog } from "./apply";

/**
 * Proposals of changes made by the assistant, kept with the chat message that proposed them
 * (`chat_messages.sources_json.proposals`). Lifecycle: pendiente → aplicada → deshecha, or pendiente → descartada.
 * Applying recomputes the plan against fresh data first, so what is applied is always consistent.
 */
export type ProposalState = "pendiente" | "aplicada" | "descartada" | "deshecha" | "error";
export type Proposal = {
  id: string;
  titulo: string;
  explicacion: string;
  operaciones: Operation[];
  estado: ProposalState;
  pasos: Plan["pasos"];
  cifras: Plan["cifras"];
  tablas: string[];
  error?: string | null;
  aplicada?: { por: string; en: string } | null;
  undo?: UndoLog | null;
};

export type WorkspaceData = { data: AnalyticsData; tables: Table[]; ctx: PlanContext; apply: { tables: ApplyTable[]; links: ApplyLink[] } };

export async function loadWorkspaceData(workspaceId: string): Promise<WorkspaceData> {
  const [data, keys] = await Promise.all([
    loadAnalyticsData(workspaceId),
    prisma.engine_object_types.findMany({ where: { workspace_id: workspaceId }, select: { key: true } }) as Promise<{ key: string }[]>,
  ]);
  const tables = allTableKeys(data).map(key => buildTable(data, key));
  const types = (data.types ?? []).map(t => {
    const custom = data.custom?.find(c => c.typeId === t.typeId);
    return { tableKey: t.tableKey, typeKey: t.typeKey, editable: t.editable,
      fieldTypes: custom ? Object.fromEntries(custom.campos.map(f => [f.key, f.type as EngineType])) : undefined };
  });
  return {
    data, tables,
    ctx: { tables, types, links: (data.links ?? []).map(l => ({ from: l.from, columna: l.columna, to: l.to })), typeKeys: keys.map(k => k.key) },
    apply: { tables: (data.types ?? []).map(t => ({ tableKey: t.tableKey, typeId: t.typeId, typeKey: t.typeKey })),
      links: (data.links ?? []).map(l => ({ from: l.from, columna: l.columna, relationId: l.relationId })) },
  };
}

/** From the assistant's tool call: the plan (dry run) and, when valid, a pending proposal to show in the chat. */
export function proposeChanges(ctx: PlanContext, args: { titulo?: string; explicacion?: string; operaciones?: Operation[] }): { plan: Plan; proposal?: Proposal } {
  const operaciones = Array.isArray(args.operaciones) ? args.operaciones : [];
  const plan = planChanges(ctx, operaciones);
  if (!plan.ok) return { plan };
  const tablas = [...new Set(plan.acciones.map(a => a.tabla))];
  return { plan, proposal: { id: randomUUID(), titulo: String(args.titulo ?? "Cambios propuestos").slice(0, 120), explicacion: String(args.explicacion ?? "").slice(0, 1000),
    operaciones, estado: "pendiente", pasos: plan.pasos, cifras: plan.cifras, tablas } };
}

type MessageRow = { id: string; sources_json: unknown };
async function findProposal(input: { userId: string; messageId: string; proposalId: string }) {
  const message = await prisma.chat_messages.findFirst({ where: { id: input.messageId, chat_conversations: { owner_user_id: input.userId } },
    select: { id: true, sources_json: true } }) as MessageRow | null;
  if (!message) throw new ApplyError("No se encuentra el mensaje.");
  const sources = message.sources_json && typeof message.sources_json === "object" ? message.sources_json as Record<string, unknown> : {};
  const proposals = (Array.isArray(sources.proposals) ? sources.proposals : []) as Proposal[];
  const proposal = proposals.find(p => p.id === input.proposalId);
  if (!proposal) throw new ApplyError("No se encuentra la propuesta.");
  const save = (next: Proposal) => prisma.chat_messages.update({ where: { id: message.id },
    data: { sources_json: { ...sources, proposals: proposals.map(p => p.id === next.id ? next : p) } as unknown as Prisma.InputJsonValue } });
  return { proposal, save };
}

export async function decideProposal(input: { workspaceId: string; userId: string; canWrite: boolean; messageId: string; proposalId: string; accion: "aplicar" | "descartar" | "deshacer" }): Promise<Proposal> {
  const { proposal, save } = await findProposal(input);
  if (input.accion === "descartar") {
    if (proposal.estado !== "pendiente") throw new ApplyError("Esta propuesta ya no está pendiente.");
    const next = { ...proposal, estado: "descartada" as const };
    await save(next); return next;
  }
  if (!input.canWrite) throw new ApplyError("Solo el propietario o un administrador puede aplicar o deshacer cambios en los datos.");
  if (input.accion === "aplicar") {
    if (proposal.estado !== "pendiente") throw new ApplyError("Esta propuesta ya no está pendiente.");
    const fresh = await loadWorkspaceData(input.workspaceId);
    const plan = planChanges(fresh.ctx, proposal.operaciones);
    if (!plan.ok) {
      const next = { ...proposal, estado: "error" as const, error: `Los datos han cambiado y la propuesta ya no se puede aplicar: ${plan.errores.join(" · ")}` };
      await save(next); return next;
    }
    const undo = await applyActions({ workspaceId: input.workspaceId, userId: input.userId, actions: plan.acciones, ...fresh.apply });
    const next: Proposal = { ...proposal, estado: "aplicada", pasos: plan.pasos, cifras: plan.cifras, error: null, aplicada: { por: input.userId, en: new Date().toISOString() }, undo };
    await save(next); return next;
  }
  if (proposal.estado !== "aplicada" || !proposal.undo) throw new ApplyError("Solo se puede deshacer una propuesta aplicada.");
  await undoActions({ workspaceId: input.workspaceId, userId: input.userId, undo: proposal.undo });
  const next: Proposal = { ...proposal, estado: "deshecha", undo: null };
  await save(next); return next;
}

/** Proposals stored with a message, for the chat (without the undo log). */
export function extractProposals(value: unknown): Omit<Proposal, "undo" | "operaciones">[] {
  const list = value && typeof value === "object" ? (value as { proposals?: unknown }).proposals : undefined;
  if (!Array.isArray(list)) return [];
  return (list as Proposal[]).filter(p => p && typeof p.id === "string" && Array.isArray(p.pasos))
    .map(({ undo: _undo, operaciones: _ops, ...p }) => p);
}
