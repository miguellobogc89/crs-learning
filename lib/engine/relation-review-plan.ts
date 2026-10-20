/**
 * Pure, read-only planner for proposed links between existing Engine records.
 * A relation definition permits a link type; it does NOT prove that a link exists.
 * Evidence must be an exact substring of the referenced document.
 */
export type RelationDefinition = {
  id: string; workspaceId: string; fromObjectTypeId: string;
  toObjectTypeId: string; cardinality: "one_to_one" | "one_to_many" | "many_to_many";
  status: "active" | "archived";
};
export type RelationRecord = {
  id: string; workspaceId: string; objectTypeId: string;
  status: "draft" | "active" | "archived";
};
export type RelationDocument = {
  id: string; workspaceId: string; extractedText: string;
};
export type ExistingRelation = {
  relationDefinitionId: string; fromRecordId: string; toRecordId: string;
};
export type RelationProposal = {
  relationDefinitionId: string; fromRecordId: string; toRecordId: string;
  documentId: string; evidenceText: string;
};
export type RelationPlan = {
  status: "REVIEW_REQUIRED" | "HELD";
  issues: string[];
  proposal: RelationProposal;
};
export function planEngineRelation(input: {
  workspaceId: string;
  definition: RelationDefinition;
  from: RelationRecord;
  to: RelationRecord;
  document: RelationDocument;
  existingRelations: readonly ExistingRelation[];
  proposal: RelationProposal;
}): RelationPlan {
  const { workspaceId, definition: d, from, to, document, existingRelations, proposal: p } = input;
  if (!workspaceId || !d || !from || !to || !document || !p ||
      !Array.isArray(existingRelations) || existingRelations.length > 10000) {
    throw new Error("Invalid relation planner input.");
  }
  const issues: string[] = [];
  if ([d.workspaceId, from.workspaceId, to.workspaceId, document.workspaceId]
      .some((id) => id !== workspaceId)) issues.push("WORKSPACE_MISMATCH");
  if (d.status !== "active" || from.status === "archived" || to.status === "archived")
    issues.push("INACTIVE_DEFINITION_OR_RECORD");
  if (d.fromObjectTypeId !== from.objectTypeId || d.toObjectTypeId !== to.objectTypeId)
    issues.push("OBJECT_TYPE_MISMATCH");
  if (p.relationDefinitionId !== d.id || p.fromRecordId !== from.id || p.toRecordId !== to.id ||
      p.documentId !== document.id) issues.push("PROPOSAL_REFERENCE_MISMATCH");
  if (from.id === to.id) issues.push("SELF_RELATION_UNSUPPORTED");
  if (typeof p.evidenceText !== "string" || !p.evidenceText.trim() ||
      typeof document.extractedText !== "string" ||
      !document.extractedText.includes(p.evidenceText))
    issues.push("EVIDENCE_NOT_IN_DOCUMENT");
  if (!["one_to_one", "one_to_many", "many_to_many"].includes(d.cardinality))
    issues.push("INVALID_CARDINALITY");
  for (const link of existingRelations) {
    if (!link || typeof link.relationDefinitionId !== "string" ||
        typeof link.fromRecordId !== "string" || typeof link.toRecordId !== "string") {
      throw new Error("Invalid existing relation.");
    }
    if (link.relationDefinitionId !== d.id) continue;
    if (link.fromRecordId === from.id && link.toRecordId === to.id)
      issues.push("RELATION_ALREADY_EXISTS");
    if (d.cardinality === "one_to_one" &&
        (link.fromRecordId === from.id || link.toRecordId === to.id) &&
        (link.fromRecordId !== from.id || link.toRecordId !== to.id))
      issues.push("CARDINALITY_CONFLICT");
    if (d.cardinality === "one_to_many" && link.toRecordId === to.id &&
        link.fromRecordId !== from.id) issues.push("CARDINALITY_CONFLICT");
  }
  return {
    status: issues.length ? "HELD" : "REVIEW_REQUIRED",
    issues: [...new Set(issues)],
    proposal: p,
  };
}
