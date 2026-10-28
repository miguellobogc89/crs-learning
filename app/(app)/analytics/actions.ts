"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";
import { updateEngineRecord, EngineRecordError } from "@/lib/engine/records.service";
import { editedCustomValues, editedValues } from "@/lib/analytics/edit";
import { LinkError, setRecordLink } from "@/lib/analytics/links";
import { mergeRecords } from "@/lib/analytics/merge";
import { archiveLines, setInvoiceParty } from "@/lib/analytics/parties";
import { loadAnalyticsData, missingTable } from "@/lib/analytics/data";
import { duplicatedLineIssues, PLAIN_EDITABLE } from "@/lib/analytics/compute";
import { normalizeView } from "@/lib/analytics/table-view";
import { saveTableView } from "@/lib/analytics/table-view.service";

/** One cell edited in Analítica → Tablas. A new revision of the record (its history keeps the previous value). */
export async function editAnalyticsCellAction(input: { recordId: string; expectedRevision: number; field: string; value: unknown }) {
  const session = await auth();
  if (!session?.user?.id) return { ok: false as const, error: "Sesión no válida." };
  const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
  if (activeWorkspace.role !== "owner" && activeWorkspace.role !== "admin") return { ok: false as const, error: "Solo el propietario o un administrador puede corregir datos." };
  const record = await prisma.engine_records.findFirst({ where: { id: input.recordId, workspace_id: activeWorkspace.id, status: { not: "archived" } },
    select: { values_json: true, engine_object_types: { select: { key: true, settings: true, engine_field_definitions: { where: { status: "active" }, select: { key: true, field_type: true } } } } } });
  if (!record) return { ok: false as const, error: "El registro ya no existe." };
  const current = record.values_json && typeof record.values_json === "object" && !Array.isArray(record.values_json) ? record.values_json as Record<string, unknown> : {};
  // Tables created with the assistant: every column is editable; the rest only the few corrections allowed.
  // Tables from documents or created with the assistant: every column. Base records: their plain fields, and the
  // few special corrections (company name, «Mi empresa», invoice type and category).
  const origen = (record.engine_object_types.settings as { origen?: string } | null)?.origen;
  const plain = origen === "asistente" || origen === "plantilla" || PLAIN_EDITABLE[record.engine_object_types.key]?.includes(input.field);
  const edited = plain ? editedCustomValues(record.engine_object_types.engine_field_definitions, current, input.field, input.value)
    : editedValues(record.engine_object_types.key, current, input.field, input.value);
  if (!edited.ok) return { ok: false as const, error: edited.error };
  try {
    await updateEngineRecord({ workspaceId: activeWorkspace.id, userId: session.user.id, recordId: input.recordId, expectedRevision: input.expectedRevision, values: edited.values });
    revalidatePath("/analytics");
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: error instanceof EngineRecordError ? error.message : "No se pudo guardar el cambio." };
  }
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
  if (activeWorkspace.role !== "owner" && activeWorkspace.role !== "admin") return { ok: false as const, error: "Solo el propietario o un administrador puede corregir datos." };
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
  if (activeWorkspace.role !== "owner" && activeWorkspace.role !== "admin") return { ok: false as const, error: "Solo el propietario o un administrador puede cambiar enlaces." };
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
