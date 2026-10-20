import type { CurrentSchema } from "./compare-existing";
import type { SchemaDiscoveryProposal } from "./validation";

export type ExistingSchemaSemanticCandidate = {
  sourceEntity: string;
  sourceField: string | null;
  targetEntity: string;
  targetField: string | null;
  decision: "POSSIBLE_EQUIVALENCE" | "DISTINCT" | "UNCERTAIN";
  reason: string;
};

/**
 * Validates AI suggestions against BOTH schema snapshots.
 * This is a review aid, never a rename/merge/mapping authorization.
 */
export function validateExistingSchemaSemanticCandidates(input: {
  proposal: SchemaDiscoveryProposal;
  current: CurrentSchema;
  candidates: unknown;
}) {
  const issues: string[] = [];
  const accepted: ExistingSchemaSemanticCandidate[] = [];
  if (!Array.isArray(input.candidates) || input.candidates.length > 100) {
    return { valid: false, candidates: accepted, issues: ["INVALID_CANDIDATES"] };
  }
  const source = new Map(input.proposal.entities.map(e => [e.key, e]));
  const target = new Map(input.current.entities.map(e => [e.key, e]));
  const seen = new Set<string>();
  for (const [i, raw] of input.candidates.entries()) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      issues.push(`INVALID_SHAPE:${i}`); continue;
    }
    const c = raw as Record<string, unknown>;
    const validText = (v: unknown) => typeof v === "string" && v.length > 0 && v.length <= 2000;
    const src = typeof c.sourceEntity === "string" ? source.get(c.sourceEntity) : undefined;
    const dst = typeof c.targetEntity === "string" ? target.get(c.targetEntity) : undefined;
    const sf = c.sourceField;
    const tf = c.targetField;
    if (!src || !dst || !validText(c.reason) ||
        !["POSSIBLE_EQUIVALENCE", "DISTINCT", "UNCERTAIN"].includes(c.decision as string) ||
        !((sf === null && tf === null) ||
          (typeof sf === "string" && typeof tf === "string" &&
            src.fields.some(f => f.key === sf) &&
            dst.fields.some(f => f.key === tf)))) {
      issues.push(`INVALID_REFERENCE:${i}`); continue;
    }
    const signature = JSON.stringify([c.sourceEntity, sf, c.targetEntity, tf]);
    if (seen.has(signature)) {
      issues.push(`DUPLICATE:${i}`); continue;
    }
    seen.add(signature);
    accepted.push({
      sourceEntity: c.sourceEntity as string,
      sourceField: sf as string | null,
      targetEntity: c.targetEntity as string,
      targetField: tf as string | null,
      decision: c.decision as ExistingSchemaSemanticCandidate["decision"],
      reason: c.reason as string,
    });
  }
  return { valid: issues.length === 0, candidates: issues.length ? [] : accepted, issues };
}
