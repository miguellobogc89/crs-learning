import { prisma } from "@/lib/prisma";

/**
 * Preferences of a workspace (`workspace_preferences.settings_json`). For now: the example questions the assistant
 * shows when it opens («sugerencias_asistente»: list of texts). Without the table (its SQL not run yet) or without
 * preferences, null: the app uses its defaults.
 */
export async function getAssistantSuggestions(workspaceId: string): Promise<string[] | null> {
  const model = (prisma as unknown as { workspace_preferences?: { findUnique(args: unknown): Promise<{ settings_json: unknown } | null> } }).workspace_preferences;
  if (!model) return null;
  try {
    const row = await model.findUnique({ where: { workspace_id: workspaceId }, select: { settings_json: true } });
    const list = row?.settings_json && typeof row.settings_json === "object" ? (row.settings_json as { sugerencias_asistente?: unknown }).sugerencias_asistente : undefined;
    if (!Array.isArray(list)) return null;
    const clean = list.filter((x): x is string => typeof x === "string" && !!x.trim()).map(x => x.trim().slice(0, 300)).slice(0, 20);
    return clean.length ? clean : null;
  } catch (error) {
    console.warn("[preferencias] sugerencias del asistente:", error instanceof Error ? error.message : error);
    return null;
  }
}
