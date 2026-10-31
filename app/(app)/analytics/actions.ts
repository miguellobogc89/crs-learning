"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";
import { addTableRow, deleteTableRows, editCell, recordHistory, restoreRevision, restoreTableRows, saveTableChanges, TableRowsError } from "@/lib/analytics/table-rows.service";
import { LinkError, setRecordLink } from "@/lib/analytics/links";
import { mergeRecords } from "@/lib/analytics/merge";
import { archiveLines, setInvoiceParty } from "@/lib/analytics/parties";
import { loadAnalyticsData, missingTable } from "@/lib/analytics/data";
import { duplicatedLineIssues } from "@/lib/analytics/compute";
import { normalizeView } from "@/lib/analytics/table-view";
import { saveTableView } from "@/lib/analytics/table-view.service";

/** One cell edited in Analítica → Tablas. A new revision of the record (its history keeps the previous value). */
export async function editAnalyticsCellAction(input: { recordId: string; expectedRevision: number; field: string; value: unknown }) {
  return rowsAction(async (workspaceId, userId) => {
    await editCell({ workspaceId, userId, recordId: input.recordId, expectedRevision: input.expectedRevision, field: input.field, value: input.value });
    return {};
  });
}

/** Any active member of the workspace can correct table data (each change stays in the record's history). */
async function rowsAction<T extends object>(run: (workspaceId: string, userId: string) => Promise<T>) {
  const session = await auth();
  if (!session?.user?.id) return { ok: false as const, error: "Sesión no válida." };
  const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
  try {
    const result = await run(activeWorkspace.id, session.user.id);
    revalidatePath("/analytics");
    return { ok: true as const, ...result };
  } catch (error) {
    if (error instanceof TableRowsError) return { ok: false as const, error: error.message };
    console.error("[analytics] filas:", error);
    return { ok: false as const, error: "No se pudo completar la operación." };
  }
}

/** The pending corrections of a table, saved together (each record on its own: see the per-record results). */
export async function saveTableChangesAction(input: { changes: unknown }) {
  return rowsAction(async (workspaceId, userId) => ({ results: await saveTableChanges({ workspaceId, userId, changes: input.changes }) }));
}
export async function addTableRowAction(input: { tableKey: string; values: unknown }) {
  return rowsAction((workspaceId, userId) => addTableRow({ workspaceId, userId, tableKey: String(input.tableKey), values: input.values }));
}
export async function deleteTableRowsAction(input: { tableKey: string; records: unknown }) {
  return rowsAction((workspaceId, userId) => deleteTableRows({ workspaceId, userId, tableKey: String(input.tableKey), records: input.records }));
}
export async function restoreTableRowsAction(input: { tableKey: string; ids: unknown }) {
  return rowsAction((workspaceId, userId) => restoreTableRows({ workspaceId, userId, tableKey: String(input.tableKey), ids: input.ids }));
}
export async function recordHistoryAction(input: { recordId: string }) {
  return rowsAction(async workspaceId => ({ revisions: await recordHistory({ workspaceId, recordId: input.recordId }) }));
}
export async function restoreRevisionAction(input: { recordId: string; expectedRevision: number; revision: number }) {
  return rowsAction(async (workspaceId, userId) => {
    await restoreRevision({ workspaceId, userId, recordId: input.recordId, expectedRevision: Number(input.expectedRevision), revision: Number(input.revision) });
    return {};
  });
}

/** "Unir con…": the duplicate company's invoices and relations move to the one that stays; the duplicate is archived. */
export async function mergeCompaniesAction(input: { sourceId: string; targetId: string }) {
  const session = await auth();
  if (!session?.user?.id) return { ok: false as const, error: "Sesión no válida." };
  const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
  if (activeWorkspace.role !== "owner" && activeWorkspace.role !== "admin") return { ok: false as const, error: "Solo el propietario o un administrador puede unir empresas." };
  try {
    const result = await prisma.$transaction(tx => mergeRecords(tx, { workspaceId: activeWorkspace.id, userId: session.user!.id!, sourceId: input.sourceId, targetId: input.targetId, typeKey: "company" }),
      { timeout: 60_000, maxWait: 15_000 });
    revalidatePath("/analytics");
    return { ok: true as const, ...result };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "No se pudieron unir." };
  }
}

/** Tablas → Facturas: who issued it / who it was billed to (an existing company, a new one, or none). */
export async function setInvoicePartyAction(input: { invoiceId: string; role: "issuer" | "customer"; companyId: string | null; nueva?: { nombre: string; nif?: string | null } }) {
  const session = await auth();
  if (!session?.user?.id) return { ok: false as const, error: "Sesión no válida." };
  const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
  if (input.role !== "issuer" && input.role !== "customer") return { ok: false as const, error: "Dato no válido." };
  try {
    const result = await prisma.$transaction(tx => setInvoiceParty(tx, { workspaceId: activeWorkspace.id, userId: session.user!.id!, invoiceId: input.invoiceId,
      role: input.role, companyId: input.companyId, nueva: input.nueva }), { timeout: 30_000, maxWait: 15_000 });
    revalidatePath("/analytics");
    return { ok: true as const, ...result };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "No se pudo guardar." };
  }
}

/** Removes the copies of lines read twice, recomputed here (never trusting the browser's list). */
export async function removeDuplicatedLinesAction(input: { invoiceIds: string[] }) {
  const session = await auth();
  if (!session?.user?.id) return { ok: false as const, error: "Sesión no válida." };
  const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
  if (activeWorkspace.role !== "owner" && activeWorkspace.role !== "admin") return { ok: false as const, error: "Solo el propietario o un administrador puede corregir datos." };
  const chosen = new Set(input.invoiceIds);
  const issues = duplicatedLineIssues(await loadAnalyticsData(activeWorkspace.id)).filter(i => chosen.has(i.invoiceId));
  try {
    const archived = await prisma.$transaction(tx => archiveLines(tx, { workspaceId: activeWorkspace.id, userId: session.user!.id!, lineIds: issues.flatMap(i => i.quitar) }), { timeout: 30_000, maxWait: 15_000 });
    revalidatePath("/analytics");
    return { ok: true as const, facturas: issues.length, lineas: archived };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "No se pudo corregir." };
  }
}

/** The person's view of a table (columns, grouping, order, rows per page), remembered for next time. */
export async function saveTableViewAction(input: { tableKey: string; view: unknown }) {
  const session = await auth();
  if (!session?.user?.id) return { ok: false as const, error: "Sesión no válida." };
  if (typeof input.tableKey !== "string" || !input.tableKey || input.tableKey.length > 120) return { ok: false as const, error: "Tabla no válida." };
  const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
  const view = normalizeView(input.view);
  try {
    await saveTableView(session.user.id, activeWorkspace.id, input.tableKey, view);
    return { ok: true as const };
  } catch (error) {
    if (missingTable(error)) return { ok: false as const, error: "La vista no se puede recordar todavía: falta crear su tabla en Neon (scripts/neon/20261028_user_table_views.sql) y ejecutar npx prisma generate." };
    console.error("[analytics] guardar vista:", error);
    return { ok: false as const, error: "No se pudo guardar la vista." };
  }
}

/** A link cell («Producto del catálogo»…): choose the row it points to, or none. */
export async function setTableLinkAction(input: { recordId: string; columna: string; targetId: string | null }) {
  const session = await auth();
  if (!session?.user?.id) return { ok: false as const, error: "Sesión no válida." };
  const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
  try {
    await prisma.$transaction((tx) => setRecordLink(tx, { workspaceId: activeWorkspace.id, userId: session.user!.id!, recordId: input.recordId, columna: input.columna, targetId: input.targetId }));
    revalidatePath("/analytics");
    return { ok: true as const };
  } catch (error) {
    if (error instanceof LinkError) return { ok: false as const, error: error.message };
    console.error("[analytics] enlace:", error);
    return { ok: false as const, error: "No se pudo guardar el enlace." };
  }
}
