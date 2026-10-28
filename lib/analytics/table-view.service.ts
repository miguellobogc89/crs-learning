import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { missingTable } from "./data";

/**
 * Where each person's table views are kept (`user_table_views`, one row per person, workspace and table). The raw
 * JSON is returned as saved; the page validates it against the table's columns (`normalizeView`). If the table does
 * not exist yet in the database, views are simply not remembered.
 */
// Prisma client generated before this table existed (`npx prisma generate` pending): treated as a missing table.
const notGenerated = () => !(prisma as unknown as Record<string, unknown>).user_table_views;
const missing = () => Object.assign(new Error("user_table_views no está en el cliente de Prisma (npx prisma generate)"), { code: "P2021" });

export async function loadTableView(userId: string, workspaceId: string, tableKey: string): Promise<unknown> {
  if (notGenerated()) return null;
  const row = await prisma.user_table_views.findUnique({ where: { user_id_workspace_id_table_key: { user_id: userId, workspace_id: workspaceId, table_key: tableKey } },
    select: { settings_json: true } }).catch((error: unknown) => { if (missingTable(error)) return null; throw error; });
  return row?.settings_json ?? null;
}

export async function saveTableView(userId: string, workspaceId: string, tableKey: string, view: unknown) {
  if (notGenerated()) throw missing();
  const settings = view as Prisma.InputJsonValue;
  await prisma.user_table_views.upsert({
    where: { user_id_workspace_id_table_key: { user_id: userId, workspace_id: workspaceId, table_key: tableKey } },
    create: { user_id: userId, workspace_id: workspaceId, table_key: tableKey, settings_json: settings },
    update: { settings_json: settings, updated_at: new Date() },
  });
}
