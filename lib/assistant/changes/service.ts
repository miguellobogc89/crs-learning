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
  /** Rows the person will have to complete once applied. */
  pendientes?: Plan["pendientes"];
  /** A bigger goal done step by step: all its steps and which one this proposal is (1-based). */
  objetivo?: { pasos: string[]; actual: number } | null;
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
export function proposeChanges(ctx: PlanContext, args: { titulo?: string; explicacion?: string; operaciones?: Operation[]; pasos_del_objetivo?: unknown; paso_actual?: unknown }): { plan: Plan; proposal?: Proposal } {
  const operaciones = Array.isArray(args.operaciones) ? args.operaciones : [];
  const plan = planChanges(ctx, operaciones);
  if (!plan.ok) return { plan };
  const tablas = [...new Set(plan.acciones.map(a => a.tabla))];
  return { plan, proposal: { id: randomUUID(), titulo: String(args.titulo ?? "Cambios propuestos").slice(0, 120), explicacion: String(args.explicacion ?? "").slice(0, 1000),
    operaciones, estado: "pendiente", pasos: plan.pasos, cifras: plan.cifras, pendientes: plan.pendientes, tablas, objetivo: goalOf(args) } };
}

function goalOf(args: { pasos_del_objetivo?: unknown; paso_actual?: unknown }) {
  const pasos = Array.isArray(args.pasos_del_objetivo) ? args.pasos_del_objetivo.filter((p): p is string => typeof p === "string" && !!p.trim()).map(p => p.trim().slice(0, 160)).slice(0, 10) : [];
  if (pasos.length < 2) return null;
  const actual = Math.min(Math.max(1, Math.floor(Number(args.paso_actual) || 1)), pasos.length);
  return { pasos, actual };
}

/**
 * After «Aplicar» (or «Deshacer»), the assistant speaks again in the conversation: what was done, where to see it,
 * what is left to complete and, when the goal has more steps, what comes next.
 */
export function followUpText(p: Pick<Proposal, "titulo" | "pendientes" | "objetivo">, tables: { key: string; label: string }[], undone = false) {
  const link = (t: { key: string; label: string }) => `[${t.label}](/analytics?view=tablas&table=${encodeURIComponent(t.key)})`;
  if (undone) return `He deshecho «${p.titulo}»: tus datos están como antes. Si quieres, preparo otra versión.`;
  const lines = [`**Hecho: ${p.titulo}.** ${tables.length ? `Puedes consultarl${tables.length === 1 ? "a" : "as"} aquí: ${tables.map(link).join(", ")}.` : ""}`.trim()];
  for (const x of p.pendientes ?? []) lines.push(`Te quedan **${x.filas.toLocaleString("es-ES")} ${x.filas === 1 ? "fila" : "filas"} por completar** en «${x.nombreColumna}» de ${x.nombreTabla}: [complétalas aquí](/analytics?view=tablas&table=${encodeURIComponent(x.tabla)}&pendiente=${encodeURIComponent(x.columna)}).`);
  const goal = p.objetivo;
  if (goal && goal.actual < goal.pasos.length) lines.push(`Cuando quieras, seguimos con el **paso ${goal.actual + 1} de ${goal.pasos.length}: ${goal.pasos[goal.actual]}**. Dime «adelante».`);
  else if (goal) lines.push("Con esto hemos terminado todos los pasos. ¿Qué quieres consultar ahora?");
  return lines.join("\n\n");
}

type MessageRow = { id: string; sources_json: unknown; conversation_id: string };
async function findProposal(input: { userId: string; messageId: string; proposalId: string }) {
  const message = await prisma.chat_messages.findFirst({ where: { id: input.messageId, chat_conversations: { owner_user_id: input.userId } },
    select: { id: true, sources_json: true, conversation_id: true } }) as MessageRow | null;
  if (!message) throw new ApplyError("No se encuentra el mensaje.");
  const sources = message.sources_json && typeof message.sources_json === "object" ? message.sources_json as Record<string, unknown> : {};
  const proposals = (Array.isArray(sources.proposals) ? sources.proposals : []) as Proposal[];
  const proposal = proposals.find(p => p.id === input.proposalId);
  if (!proposal) throw new ApplyError("No se encuentra la propuesta.");
  const save = (next: Proposal) => prisma.chat_messages.update({ where: { id: message.id },
    data: { sources_json: { ...sources, proposals: proposals.map(p => p.id === next.id ? next : p) } as unknown as Prisma.InputJsonValue } });
  return { proposal, save, conversationId: message.conversation_id };
}

export type FollowUp = { id: string; role: "assistant"; content: string; sources: []; dataBlocks: []; proposals: [] };
async function postFollowUp(conversationId: string, userId: string, content: string): Promise<FollowUp> {
  const saved = await prisma.chat_messages.create({ data: { conversation_id: conversationId, user_id: userId, role: "assistant", content, sources_json: { seguimiento: true } } });
  await prisma.chat_conversations.update({ where: { id: conversationId }, data: { updated_at: new Date(), updated_by_user_id: userId } }).catch(() => undefined);
  return { id: saved.id, role: "assistant", content, sources: [], dataBlocks: [], proposals: [] };
}

export async function decideProposal(input: { workspaceId: string; userId: string; canWrite: boolean; messageId: string; proposalId: string; accion: "aplicar" | "descartar" | "deshacer" }): Promise<{ proposal: Proposal; message?: FollowUp }> {
  const { proposal, save, conversationId } = await findProposal(input);
  if (input.accion === "descartar") {
    if (proposal.estado !== "pendiente") throw new ApplyError("Esta propuesta ya no está pendiente.");
    const next = { ...proposal, estado: "descartada" as const };
    await save(next); return { proposal: next };
  }
  if (!input.canWrite) throw new ApplyError("Solo el propietario o un administrador puede aplicar o deshacer cambios en los datos.");
  if (input.accion === "aplicar") {
    if (proposal.estado !== "pendiente") throw new ApplyError("Esta propuesta ya no está pendiente.");
    const fresh = await loadWorkspaceData(input.workspaceId);
    const plan = planChanges(fresh.ctx, proposal.operaciones);
    if (!plan.ok) {
      const next = { ...proposal, estado: "error" as const, error: `Los datos han cambiado y la propuesta ya no se puede aplicar: ${plan.errores.join(" · ")}` };
      await save(next); return { proposal: next };
    }
    const undo = await applyActions({ workspaceId: input.workspaceId, userId: input.userId, actions: plan.acciones, ...fresh.apply });
    const next: Proposal = { ...proposal, estado: "aplicada", pasos: plan.pasos, cifras: plan.cifras, pendientes: plan.pendientes, error: null, aplicada: { por: input.userId, en: new Date().toISOString() }, undo };
    await save(next);
    // Tables to point at: the new ones (by the names given in the plan) and the existing ones it changed.
    const created = plan.acciones.flatMap(a => a.k === "tabla" ? [{ key: a.tabla, label: a.nombre }] : []);
    const touched = [...new Set(plan.acciones.map(a => a.tabla))].filter(k => !created.some(c => c.key === k))
      .map(k => ({ key: k, label: fresh.tables.find(t => t.key === k)?.label ?? k }));
    const message = await postFollowUp(conversationId, input.userId, followUpText(next, [...created, ...touched]));
    return { proposal: next, message };
  }
  if (proposal.estado !== "aplicada" || !proposal.undo) throw new ApplyError("Solo se puede deshacer una propuesta aplicada.");
  await undoActions({ workspaceId: input.workspaceId, userId: input.userId, undo: proposal.undo });
  const next: Proposal = { ...proposal, estado: "deshecha", undo: null };
  await save(next);
  return { proposal: next, message: await postFollowUp(conversationId, input.userId, followUpText(next, [], true)) };
}

/** Proposals stored with a message, for the chat (without the undo log). */
export function extractProposals(value: unknown): Omit<Proposal, "undo" | "operaciones">[] {
  const list = value && typeof value === "object" ? (value as { proposals?: unknown }).proposals : undefined;
  if (!Array.isArray(list)) return [];
  return (list as Proposal[]).filter(p => p && typeof p.id === "string" && Array.isArray(p.pasos))
    .map(({ undo: _undo, operaciones: _ops, ...p }) => p);
}
