// components/knowledge/detail/summary/summary.utils.ts

import type { KnowledgeDocumentContribution } from "@/lib/knowledge/knowledge-analysis.types";

import type {
  Contradiction,
  ParsedQualityAnalysis,
  QualityReport,
  SourceReference,
} from "./summary.types";

export function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

export function toStringArray(
  value: unknown,
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is string =>
      typeof item === "string" &&
      item.trim().length > 0,
  );
}

export function toNumber(
  value: unknown,
  fallback = 0,
) {
  if (typeof value !== "number") {
    return fallback;
  }

  return value;
}

export function parseDocumentContributions(
  value: unknown,
): KnowledgeDocumentContribution[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const contributions: KnowledgeDocumentContribution[] =
    [];

  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }

    const sourceId =
      typeof item.source_id === "string"
        ? item.source_id
        : "";

    const fileName =
      typeof item.file_name === "string"
        ? item.file_name
        : "";

    if (!sourceId || !fileName) {
      continue;
    }

    contributions.push({
      sourceId,
      fileName,
      documentRole:
        typeof item.document_role === "string"
          ? item.document_role
          : "reference",
      contributionType:
        typeof item.contribution_type ===
        "string"
          ? item.contribution_type
          : "reference",
      contributionFocus:
        typeof item.contribution_focus ===
        "string"
          ? item.contribution_focus
          : "mixed",
      summary:
        typeof item.summary === "string"
          ? item.summary
          : "",
      supportedSections: toStringArray(
        item.supported_sections,
      ),
    });
  }

  return contributions;
}

export function parseSourceReferences(
  value: unknown,
): SourceReference[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const references: SourceReference[] = [];

  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }

    const section =
      typeof item.section === "string"
        ? item.section
        : "";

    const claim =
      typeof item.claim === "string"
        ? item.claim
        : "";

    if (!section || !claim) {
      continue;
    }

    references.push({
      section,
      claim,
      sourceIds: toStringArray(
        item.source_ids,
      ),
      sourceFiles: toStringArray(
        item.source_files,
      ),
      pages: Array.isArray(item.pages)
        ? item.pages.filter(
            (
              page,
            ): page is number =>
              typeof page === "number",
          )
        : [],
    });
  }

  return references;
}

export function parseContradictions(
  value: unknown,
): Contradiction[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const contradictions: Contradiction[] = [];

  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }

    contradictions.push({
      topic:
        typeof item.topic === "string"
          ? item.topic
          : "Contradicción detectada",
      description:
        typeof item.description ===
        "string"
          ? item.description
          : "",
      severity:
        typeof item.severity === "string"
          ? item.severity
          : "medium",
      recommendedAction:
        typeof item.recommended_action ===
        "string"
          ? item.recommended_action
          : "",
    });
  }

  return contradictions;
}

export function parseQualityReport(
  value: unknown,
): QualityReport {
  if (!isRecord(value)) {
    return {
      documentCount: 0,
      sourceCoverage: 0,
      contradictionCount: 0,
      duplicateTopics: [],
      complementaryTopics: [],
      unsupportedClaims: [],
      confidenceNotes: [],
    };
  }

  return {
    documentCount: toNumber(
      value.document_count,
    ),
    sourceCoverage: toNumber(
      value.source_coverage,
    ),
    contradictionCount: toNumber(
      value.contradiction_count,
    ),
    duplicateTopics: toStringArray(
      value.duplicate_topics,
    ),
    complementaryTopics: toStringArray(
      value.complementary_topics,
    ),
    unsupportedClaims: toStringArray(
      value.unsupported_claims,
    ),
    confidenceNotes: toStringArray(
      value.confidence_notes,
    ),
  };
}

export function parseQualityAnalysis(
  analysisJson: unknown,
): ParsedQualityAnalysis {
  if (!isRecord(analysisJson)) {
    return {
      qualityReport: parseQualityReport(null),
      documentContributions: [],
      sourceReferences: [],
      contradictions: [],
    };
  }

  return {
    qualityReport: parseQualityReport(
      analysisJson.quality_report,
    ),
    documentContributions:
      parseDocumentContributions(
        analysisJson.document_contributions,
      ),
    sourceReferences:
      parseSourceReferences(
        analysisJson.source_references,
      ),
    contradictions:
      parseContradictions(
        analysisJson.contradictions,
      ),
  };
}

export function getCoveragePercentage(
  value: number,
) {
  if (value <= 0) {
    return 0;
  }

  if (value <= 1) {
    return Math.round(value * 100);
  }

  return Math.round(value);
}

export function getContributionLabel(
  type: string,
) {
  const labels: Record<string, string> = {
    primary: "Principal",
    complementary: "Complementario",
    policy: "Política",
    form: "Formulario",
    checklist: "Checklist",
    faq: "FAQ",
    reference: "Referencia",
    evidence: "Evidencia",
  };

  return labels[type] ?? "Referencia";
}

export function getDocumentRoleLabel(
  role: string,
) {
  const labels: Record<string, string> = {
    procedure: "Procedimiento",
    process: "Proceso",
    manual: "Manual",
    policy: "Política",
    checklist: "Checklist",
    form: "Formulario",
    faq: "FAQ",
    technical: "Técnico",
    functional: "Funcional",
    catalog: "Catálogo",
    reference: "Referencia",
    evidence: "Evidencia",
    other: "Otro",
  };

  return labels[role] ?? "Referencia";
}

export function getContributionFocusLabel(
  focus: string,
) {
  const labels: Record<string, string> = {
    procedure_steps:
      "Pasos del procedimiento",
    validation: "Validación",
    governance: "Gobierno",
    data_capture: "Captura de datos",
    answers: "Respuestas",
    technical_detail:
      "Detalle técnico",
    reference_context:
      "Contexto de referencia",
    evidence: "Evidencia",
    mixed: "Mixto",
  };

  return labels[focus] ?? "Mixto";
}

export function getSectionLabel(
  section: string,
) {
  const labels: Record<string, string> = {
    summary: "Resumen",
    objective: "Objetivo",
    scope: "Alcance",
    systems: "Sistemas",
    actors: "Actores",
    important_dates: "Fechas importantes",
    business_rules: "Reglas de negocio",
    procedures: "Procedimiento",
    prerequisites: "Requisitos previos",
    triggers: "Cuándo se aplica",
    outputs: "Resultados esperados",
    warnings: "Advertencias",
    common_errors: "Errores frecuentes",
    common_questions: "Preguntas frecuentes",
    glossary: "Glosario",
    context: "Contexto",
    concepts: "Conceptos",
  };

  return (
    labels[section] ??
    section
      .replaceAll("_", " ")
      .replace(/\b\w/g, (letter) =>
        letter.toUpperCase(),
      )
  );
}