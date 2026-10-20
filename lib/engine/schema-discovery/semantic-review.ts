import type { DiscoveryEvidence, SchemaDiscoveryProposal } from "./validation";

export type SemanticMatchCandidate = {
  leftEntity: string;
  rightEntity: string;
  decision: "POSSIBLE_EQUIVALENCE" | "DISTINCT" | "UNCERTAIN";
  reason: string;
};
export type SemanticMatchIssue = {
  code: "INVALID_SHAPE" | "UNKNOWN_ENTITY" | "SAME_ENTITY" | "DUPLICATE_PAIR" | "LIMIT_EXCEEDED";
  path: string;
};
export type SemanticMatchReview = {
  valid: boolean;
  candidates: Array<SemanticMatchCandidate & {
    leftEvidence: DiscoveryEvidence[];
    rightEvidence: DiscoveryEvidence[];
    requiresReview: boolean;
  }>;
  issues: SemanticMatchIssue[];
};

/**
 * Verify semantic entity-comparison proposals against an already validated
 * schema. Never rename, merge, discard or persist entities.
 * Evidence comes from trusted validated schema, not model-generated quotes.
 */
export function reviewSemanticEntityMatches(
  proposal: SchemaDiscoveryProposal,
  raw: unknown,
): SemanticMatchReview {
  const issues: SemanticMatchIssue[] = [];
  const candidates: SemanticMatchReview["candidates"] = [];
  if (!Array.isArray(raw)) {
    return { valid: false, candidates, issues: [{ code: "INVALID_SHAPE", path: "$" }] };
  }
  if (raw.length > 100) issues.push({ code: "LIMIT_EXCEEDED", path: "$" });
  const entities = new Map(proposal.entities.map((e) => [e.key, e]));
  const seen = new Set<string>();
  for (const [index, value] of raw.entries()) {
    const path = `[${index}]`;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      issues.push({ code: "INVALID_SHAPE", path }); continue;
    }
    const v = value as Record<string, unknown>;
    if (typeof v.leftEntity !== "string" || typeof v.rightEntity !== "string" ||
        typeof v.reason !== "string" || v.reason.trim().length === 0 ||
        v.reason.length > 2000 ||
        !["POSSIBLE_EQUIVALENCE", "DISTINCT", "UNCERTAIN"].includes(v.decision as string)) {
      issues.push({ code: "INVALID_SHAPE", path }); continue;
    }
    if (!entities.has(v.leftEntity) || !entities.has(v.rightEntity)) {
      issues.push({ code: "UNKNOWN_ENTITY", path }); continue;
    }
    if (v.leftEntity === v.rightEntity) {
      issues.push({ code: "SAME_ENTITY", path }); continue;
    }
    const pair = [v.leftEntity, v.rightEntity].sort().join("::");
    if (seen.has(pair)) {
      issues.push({ code: "DUPLICATE_PAIR", path }); continue;
    }
    seen.add(pair);
    candidates.push({
      leftEntity: v.leftEntity, rightEntity: v.rightEntity,
      decision: v.decision as SemanticMatchCandidate["decision"],
      reason: v.reason,
      leftEvidence: [...entities.get(v.leftEntity)!.evidence],
      rightEvidence: [...entities.get(v.rightEntity)!.evidence],
      requiresReview: v.decision !== "DISTINCT",
    });
  }
  return { valid: issues.length === 0, candidates: issues.length ? [] : candidates, issues };
}
