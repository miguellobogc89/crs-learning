"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";
import { updateEngineRecord, EngineRecordError } from "@/lib/engine/records.service";
import { editedValues } from "@/lib/analytics/edit";
import { mergeRecords } from "@/lib/analytics/merge";
import { archiveLines, setInvoiceParty } from "@/lib/analytics/parties";
import { loadAnalyticsData } from "@/lib/analytics/data";
import { duplicatedLineIssues } from "@/lib/analytics/compute";

/** One cell edited in Analítica → Tablas. A new revision of the record (its history keeps the previous value). */
export async function editAnalyticsCellAction(input: { recordId: string; expectedRevision: number; field: string; value: unknown }) {
  const session = await auth();
  if (!session?.user?.id) return { ok: false as const, error: "Sesión no válida." };
  const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
  if (activeWorkspace.role !== "owner" && activeWorkspace.role !== "admin") return { ok: false as const, error: "Solo el propietario o un administrador puede corregir datos." };
  const record = await prisma.engine_records.findFirst({ where: { id: input.recordId, workspace_id: activeWorkspace.id, status: { not: "archived" } },
    select: { values_json: true, engine_object_types: { select: { key: true } } } });
  if (!record) return { ok: false as const, error: "El registro ya no existe." };
  const current = record.values_json && typeof record.values_json === "object" && !Array.isArray(record.values_json) ? record.values_json as Record<string, unknown> : {};
  const edited = editedValues(record.engine_object_types.key, current, input.field, input.value);
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
