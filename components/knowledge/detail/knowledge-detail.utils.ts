// components/knowledge/detail/knowledge-detail.utils.ts
import type {
  SourceContribution,
} from "./knowledge-detail.types";

export function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

export function getSourceContributions(
  analysisJson: unknown,
): SourceContribution[] {
  if (!isRecord(analysisJson)) {
    return [];
  }

  const value = analysisJson.source_contributions;

  if (!Array.isArray(value)) {
    return [];
  }

  const contributions: SourceContribution[] = [];

  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }

    let knowledgeFileId = "";

    if (typeof item.knowledge_file_id === "string") {
      knowledgeFileId = item.knowledge_file_id;
    } else if (typeof item.file_id === "string") {
      knowledgeFileId = item.file_id;
    }

    let percentage: number | null = null;

    if (typeof item.percentage === "number") {
      percentage = item.percentage;
    }

    if (!knowledgeFileId || percentage === null) {
      continue;
    }

    contributions.push({
      knowledgeFileId,
      percentage,
    });
  }

  return contributions;
}