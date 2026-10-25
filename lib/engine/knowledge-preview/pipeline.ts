import type { KnowledgeEnginePreview } from "./types";
import type { PreviewSchema } from "./schema";

export function relationNeedsEvidence(schema: PreviewSchema, relationKey: string): boolean {
  const relation = schema.relations.find(item => item.key === relationKey);
  return !!relation && (relation.roleEvidenceRequired ||
    !schema.entities.some(entity => entity.key === relation.toEntity && entity.ownedBy === relationKey));
}

/** Only advance checkpoints with unprocessed work; errors require an explicit retry. */
export function automaticPreviewKey(preview: KnowledgeEnginePreview): string | null {
  if (preview.status === "idle") return "initial";
  if (preview.status !== "incomplete" || preview.schemaError || preview.schemaIssues.length ||
      preview.documents.some(document => document.status === "failed" || document.status === "needs_review")) return null;
  const pending = preview.documents.filter(document => document.status === "pending").map(document => document.segmentId).sort();
  return pending.length ? `${preview.schema ? "schema" : "no-schema"}:${pending.join("|")}` : null;
}

/** Literal checks do not establish semantic correctness; batch conflicts still require review. */
export function batchNeedsReview(preview: Pick<KnowledgeEnginePreview, "clusters" | "labelIssues">): boolean {
  return preview.labelIssues.length > 0 || preview.clusters.some(cluster => cluster.unresolved || cluster.conflicts.length > 0);
}
