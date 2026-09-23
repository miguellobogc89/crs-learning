import type { KnowledgePreflightResult } from "./preflight";

// Only confirmed duplicates may be excluded automatically.
export function resolveDuplicateSelection(preflight: KnowledgePreflightResult) {
  const hasBlockingReview =
    preflight.unsupportedFiles.length > 0 ||
    preflight.possibleDuplicateFiles.length > 0 ||
    preflight.unreadableExistingDocumentIds.length > 0;
  const allFilesDuplicate =
    !hasBlockingReview &&
    preflight.duplicateFiles.length > 0 &&
    preflight.acceptedFiles.length === 0;

  return {
    hasBlockingReview,
    allFilesDuplicate,
    requiresReview: hasBlockingReview || allFilesDuplicate,
    queuePreflight: {
      ...preflight,
      files: preflight.files.filter((result) => result.status !== "duplicate"),
      duplicateFiles: [],
    } satisfies KnowledgePreflightResult,
  };
}
