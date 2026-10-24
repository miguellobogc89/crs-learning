import { prisma } from "@/lib/prisma";
import type { PreviewBlock } from "./preview-identity-resolution";
import { resolvePreviewIdentities } from "./preview-identity-resolution";

const normalized = (s: string) => s.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
type Candidate = { id: string; name: string; externalKey: string | null };
type Match = { previewId: string; name: string; state: "NO_MATCH" | "EXACT_MATCH" | "AMBIGUOUS" | "TYPE_NOT_DEFINED" | "CHECK_INCOMPLETE"; candidates: Candidate[] };

// Read only, scoped to workspace and exact engine type key.
// No cross-type semantic aliases or automatic merges.
export async function compareExistingEngineRecords(workspaceId: string, blocks: PreviewBlock[]) {
  const graph = resolvePreviewIdentities(blocks);
  const types = await prisma.engine_object_types.findMany({
    where: { workspace_id: workspaceId, key: { in: ["recipe", "ingredient"] } },
    select: { id: true, key: true },
  });
  const typeByKey = new Map(types.map(t => [t.key, t.id]));
  async function compare(key: "recipe" | "ingredient", items: { id: string; name: string }[]): Promise<Match[]> {
    const typeId = typeByKey.get(key);
    if (!typeId) return items.map(item => ({ previewId: item.id, name: item.name, state: "TYPE_NOT_DEFINED", candidates: [] }));
    // A bounded scan cannot prove absence of duplicates if the type exceeds the bound.
    const limit = 2001;
    const rows = await prisma.engine_records.findMany({
      where: { workspace_id: workspaceId, object_type_id: typeId, status: { not: "archived" } },
      select: { id: true, external_key: true, values_json: true },
      take: limit,
      orderBy: { id: "asc" },
    });
    const complete = rows.length < limit;
    const byName = new Map<string, Candidate[]>();
    for (const row of rows) {
      const values = row.values_json;
      if (!values || typeof values !== "object" || Array.isArray(values)) continue;
      const name = (values as Record<string, unknown>).name;
      if (typeof name !== "string" || !name.trim()) continue;
      const k = normalized(name);
      byName.set(k, [...(byName.get(k) ?? []), { id: row.id, name, externalKey: row.external_key }]);
    }
    return items.map(item => {
      const candidates = byName.get(normalized(item.name)) ?? [];
      return {
        previewId: item.id, name: item.name, candidates,
        state: !complete ? "CHECK_INCOMPLETE" as const : candidates.length > 1 ? "AMBIGUOUS" as const : candidates.length === 1 ? "EXACT_MATCH" as const : "NO_MATCH" as const,
      };
    });
  }
  const [recipes, ingredients] = await Promise.all([
    compare("recipe", graph.recipes), compare("ingredient", graph.ingredients),
  ]);
  return {
    recipes, ingredients,
    summary: {
      exactMatches: [...recipes, ...ingredients].filter(x => x.state === "EXACT_MATCH").length,
      ambiguous: [...recipes, ...ingredients].filter(x => x.state === "AMBIGUOUS").length,
      unmatched: [...recipes, ...ingredients].filter(x => x.state === "NO_MATCH").length,
      unchecked: [...recipes, ...ingredients].filter(x => x.state === "TYPE_NOT_DEFINED" || x.state === "CHECK_INCOMPLETE").length,
    },
    readOnly: true, writesPerformed: false,
  };
}
