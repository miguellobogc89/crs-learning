// lib/knowledge/parse-knowledge-analysis.ts
import {
  KnowledgeViewModel,
  RawKnowledgeAnalysisJson,
} from "@/lib/knowledge/knowledge-analysis.types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toNumber(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function toNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : null;
}

function toStringMatrix(value: unknown): string[][] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(Array.isArray)
    .map((row) =>
      row.map((cell) =>
        typeof cell === "string" ? cell : String(cell ?? ""),
      ),
    );
}

export function parseKnowledgeAnalysis(
  raw: RawKnowledgeAnalysisJson | null | undefined
): KnowledgeViewModel | null {
  if (!raw || !isRecord(raw)) {
    return null;
  }

  const metaRaw = isRecord(raw.meta) ? raw.meta : {};

  const importantDates = Array.isArray(raw.important_dates)
    ? raw.important_dates.filter(isRecord).map((item) => ({
        label: toString(item.label),
        value: toString(item.value),
      }))
    : [];

  const systems = Array.isArray(raw.systems)
    ? raw.systems.filter(isRecord).map((item) => ({
        name: toString(item.name),
        description: toString(item.description),
      }))
    : [];

  const actors = Array.isArray(raw.actors)
    ? raw.actors.filter(isRecord).map((item) => ({
        name: toString(item.name),
        role: toString(item.role),
      }))
    : [];

  const concepts = Array.isArray(raw.concepts)
    ? raw.concepts.filter(isRecord).map((item) => ({
        name: toString(item.name),
        definition: toString(item.definition),
      }))
    : [];

  const procedures = Array.isArray(raw.procedures)
    ? raw.procedures.filter(isRecord).map((procedure) => ({
        name: toString(procedure.name),
        goal: toString(procedure.goal),
        steps: Array.isArray(procedure.steps)
          ? procedure.steps.filter(isRecord).map((step) => ({
              order: toNumber(step.order),
              title: toString(step.title),
              instruction: toString(step.instruction),
              expectedResult: toString(step.expected_result),
            }))
          : [],
      }))
    : [];

  const glossary = Array.isArray(raw.glossary)
    ? raw.glossary.filter(isRecord).map((item) => ({
        term: toString(item.term),
        definition: toString(item.definition),
      }))
    : [];

  const executiveSummaryRaw = isRecord(raw.executive_summary)
    ? raw.executive_summary
    : {};

  const legacySummary = toString(raw.summary);

  const responsibilities = Array.isArray(raw.responsibilities)
    ? raw.responsibilities.filter(isRecord).map((item) => ({
        action: toString(item.action),
        responsible: toString(item.responsible),
        confidence: toString(item.confidence),
        notes: toString(item.notes),
      }))
    : [];

  const checklists = Array.isArray(raw.checklists)
    ? raw.checklists.filter(isRecord).map((item) => ({
        title: toString(item.title),
        items: toStringArray(item.items),
      }))
    : [];

  const catalogTables = Array.isArray(raw.catalog_tables)
    ? raw.catalog_tables.filter(isRecord).map((item) => ({
        title: toString(item.title),
        description: toString(item.description),
        columns: toStringArray(item.columns),
        rows: toStringMatrix(item.rows),
      }))
    : [];

  return {
    detectedType: toString(raw.detected_type),
    meta: {
      language: toString(metaRaw.language),
      domain: toString(metaRaw.domain),
      level: toString(metaRaw.level),
      confidence: toNumber(metaRaw.confidence),
    },
    executiveSummary: {
      synthesis:
        toString(executiveSummaryRaw.synthesis) || legacySummary,
      keyPoints: toStringArray(executiveSummaryRaw.key_points),
      conclusion: toNullableString(executiveSummaryRaw.conclusion),
    },
    summary: legacySummary,
    objective: toString(raw.objective),
    scope: toString(raw.scope),
    importantDates,
    systems,
    actors,
    topics: toStringArray(raw.topics),
    concepts,
    prerequisites: toStringArray(raw.prerequisites),
    triggers: toStringArray(raw.triggers),
    businessRules: toStringArray(raw.business_rules),
    warnings: toStringArray(raw.warnings),
    procedures,
    responsibilities,
    checklists,
    catalogTables,
    outputs: toStringArray(raw.outputs),
    glossary,
    commonQuestions: toStringArray(raw.common_questions),
    commonErrors: toStringArray(raw.common_errors),
  };
}
