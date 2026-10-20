/**
 * Read-only entity identity suggestions between observations and existing
 * records. An observation key identifies evidence, NOT a real-world entity.
 * Matching labels are only review hints: never auto-merge or auto-link.
 */
export type EntityIdentityRecord = {
  id: string;
  workspaceId: string;
  objectTypeId: string;
  status: "draft" | "active" | "archived";
  values: Record<string, unknown>;
};

export type EntityIdentityCandidate = {
  workspaceId: string;
  objectTypeId: string;
  values: Record<string, unknown>;
};

export type EntityIdentitySuggestion = {
  recordId: string;
  reason: "EXACT_NORMALIZED_LABEL";
};

export type EntityIdentityReview = {
  status: "NO_MATCH" | "POSSIBLE_MATCH_REVIEW_REQUIRED";
  suggestions: EntityIdentitySuggestion[];
};

function normalizedLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const label = value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
  return label.length >= 2 && label.length <= 200 ? label : null;
}

function label(values: Record<string, unknown>): string | null {
  // Only generic, explicitly named identifying labels; no industry assumptions.
  for (const key of ["name", "legal_name", "title"]) {
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      return normalizedLabel(values[key]);
    }
  }
  return null;
}

export function planEntityIdentityReview(input: {
  candidate: EntityIdentityCandidate;
  records: readonly EntityIdentityRecord[];
}): EntityIdentityReview {
  const { candidate, records } = input;
  if (!candidate || !candidate.workspaceId || !candidate.objectTypeId ||
      !candidate.values || typeof candidate.values !== "object" ||
      Array.isArray(candidate.values) || !Array.isArray(records) ||
      records.length > 500) {
    throw new Error("Invalid entity identity review input.");
  }
  const target = label(candidate.values);
  const suggestions: EntityIdentitySuggestion[] = [];
  const ids = new Set<string>();
  for (const record of records) {
    if (!record || !record.id || !record.workspaceId || !record.objectTypeId ||
        !record.values || typeof record.values !== "object" ||
        Array.isArray(record.values) || ids.has(record.id)) {
      throw new Error("Invalid or duplicated identity record.");
    }
    ids.add(record.id);
    // Never match across workspaces, types or archived records.
    if (record.workspaceId !== candidate.workspaceId ||
        record.objectTypeId !== candidate.objectTypeId ||
        record.status === "archived" || !target) continue;
    if (label(record.values) === target) {
      suggestions.push({ recordId: record.id, reason: "EXACT_NORMALIZED_LABEL" });
    }
  }
  return {
    status: suggestions.length ? "POSSIBLE_MATCH_REVIEW_REQUIRED" : "NO_MATCH",
    suggestions,
  };
}
