import { createHash } from "node:crypto";
import type { EngineImportCandidate } from "./import-preflight";

/**
 * Deterministic identity of an extraction observation, NOT of the real-world
 * entity. Safe for idempotent reprocessing of the same document evidence.
 *
 * Do not use this key to merge observations from different documents or to
 * decide whether different values represent the same business entity.
 */
export function extractionObservationKey(input: {
  workspaceId: string;
  candidate: EngineImportCandidate;
}): string {
  const { workspaceId, candidate } = input;
  if (!workspaceId || !candidate ||
      !candidate.documentId || !candidate.objectTypeId ||
      !candidate.fieldKey || !candidate.evidenceText?.trim() ||
      !candidate.values || typeof candidate.values !== "object" ||
      Array.isArray(candidate.values)) {
    throw new Error("Valid workspace and evidence-backed candidate required.");
  }
  function canonical(value: unknown): string {
    if (value === null || typeof value === "string" ||
        typeof value === "boolean" || typeof value === "number") {
      if (typeof value === "number" && !Number.isFinite(value)) {
        throw new Error("Non-finite numeric value.");
      }
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
    if (typeof value === "object") {
      const object = value as Record<string, unknown>;
      return "{" + Object.keys(object).sort().map((key) =>
        JSON.stringify(key) + ":" + canonical(object[key])).join(",") + "}";
    }
    throw new Error("Unsupported observation value.");
  }
  const payload = canonical([
    "crs-extraction-observation-v1",
    workspaceId,
    candidate.documentId,
    candidate.objectTypeId,
    candidate.fieldKey,
    candidate.evidenceText,
    candidate.values,
  ]);
  return "obs_" + createHash("sha256").update(payload).digest("hex");
}
