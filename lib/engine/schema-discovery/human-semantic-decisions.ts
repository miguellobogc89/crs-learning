import type { SemanticMatchCandidate } from "./semantic-review";

export type HumanSemanticDecision = {
  leftEntity: string;
  rightEntity: string;
  decision: "DISTINCT";
};

/**
 * Human-reviewed decisions are separate from AI proposals.
 * Only an explicitly reviewed ambiguous pair may be marked DISTINCT.
 * Merging is intentionally unsupported until a safe merge workflow exists.
 */
export function applyHumanSemanticDecisions(input: {
  aiCandidates: readonly SemanticMatchCandidate[];
  decisions: readonly HumanSemanticDecision[];
}): SemanticMatchCandidate[] {
  if (!Array.isArray(input.aiCandidates) || !Array.isArray(input.decisions)) {
    throw new Error("Semantic candidates and human decisions must be arrays.");
  }
  const pairKey = (left: string, right: string) => [left, right].sort().join("::");
  const candidates = new Map(input.aiCandidates.map((candidate) =>
    [pairKey(candidate.leftEntity, candidate.rightEntity), candidate]));
  const seen = new Set<string>();
  for (const decision of input.decisions) {
    if (!decision || decision.decision !== "DISTINCT" ||
        typeof decision.leftEntity !== "string" ||
        typeof decision.rightEntity !== "string" ||
        decision.leftEntity === decision.rightEntity) {
      throw new Error("Unsupported human semantic decision.");
    }
    const key = pairKey(decision.leftEntity, decision.rightEntity);
    if (seen.has(key)) throw new Error("Duplicate human semantic decision.");
    seen.add(key);
    const candidate = candidates.get(key);
    if (!candidate || candidate.decision === "DISTINCT") {
      throw new Error("Only existing ambiguous semantic pairs can be resolved.");
    }
  }
  return input.aiCandidates.map((candidate) => {
    const key = pairKey(candidate.leftEntity, candidate.rightEntity);
    return seen.has(key)
      ? { ...candidate, decision: "DISTINCT" as const,
          reason: "Explicit human approval: keep entities distinct. AI concern: " + candidate.reason }
      : { ...candidate };
  });
}
