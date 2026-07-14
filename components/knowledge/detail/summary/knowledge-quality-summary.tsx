// components/knowledge/detail/summary/knowledge-quality-summary.tsx
"use client";

import {
  AlertTriangle,
  FileText,
} from "lucide-react";

import type { KnowledgeDocumentContribution } from "@/lib/knowledge/knowledge-analysis.types";

type KnowledgeFile = {
  id: string;
  file_name: string;
  file_size: number | null;
  status: string;
};

type QualityReport = {
  documentCount: number;
  sourceCoverage: number;
  contradictionCount: number;
  duplicateTopics: string[];
  complementaryTopics: string[];
  unsupportedClaims: string[];
  confidenceNotes: string[];
};

type SourceReference = {
  section: string;
  claim: string;
  sourceIds: string[];
  sourceFiles: string[];
  pages: number[];
};

type Contradiction = {
  topic: string;
  description: string;
  severity: string;
  recommendedAction: string;
};

type ParsedQualityAnalysis = {
  qualityReport: QualityReport;
  documentContributions: KnowledgeDocumentContribution[];
  sourceReferences: SourceReference[];
  contradictions: Contradiction[];
};

type Props = {
  analysisJson: unknown;
  files: KnowledgeFile[];
};

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is string =>
      typeof item === "string" &&
      item.trim().length > 0,
  );
}

function toNumber(value: unknown, fallback = 0) {
  if (typeof value !== "number") {
    return fallback;
  }

  return value;
}

function parseDocumentContributions(
  value: unknown,
): KnowledgeDocumentContribution[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const contributions: KnowledgeDocumentContribution[] = [];

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
        typeof item.contribution_type === "string"
          ? item.contribution_type
          : "reference",
      contributionFocus:
        typeof item.contribution_focus === "string"
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

function parseSourceReferences(
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

    const pages = Array.isArray(item.pages)
      ? item.pages.filter(
          (page): page is number =>
            typeof page === "number",
        )
      : [];

    references.push({
      section,
      claim,
      sourceIds: toStringArray(item.source_ids),
      sourceFiles: toStringArray(
        item.source_files,
      ),
      pages,
    });
  }

  return references;
}

function parseContradictions(
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
        typeof item.description === "string"
          ? item.description
          : "",
      severity:
        typeof item.severity === "string"
          ? item.severity
          : "medium",
      recommendedAction:
        typeof item.recommended_action === "string"
          ? item.recommended_action
          : "",
    });
  }

  return contradictions;
}

function parseQualityReport(
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
    documentCount: toNumber(value.document_count),
    sourceCoverage: toNumber(value.source_coverage),
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

function parseQualityAnalysis(
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
    sourceReferences: parseSourceReferences(
      analysisJson.source_references,
    ),
    contradictions: parseContradictions(
      analysisJson.contradictions,
    ),
  };
}

function getCoveragePercentage(value: number) {
  if (value <= 0) {
    return 0;
  }

  if (value <= 1) {
    return Math.round(value * 100);
  }

  return Math.round(value);
}

function getContributionLabel(type: string) {
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

function getDocumentRoleLabel(role: string) {
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

function getContributionFocusLabel(focus: string) {
  const labels: Record<string, string> = {
    procedure_steps: "Pasos del procedimiento",
    validation: "Validación",
    governance: "Gobierno",
    data_capture: "Captura de datos",
    answers: "Respuestas",
    technical_detail: "Detalle técnico",
    reference_context: "Contexto de referencia",
    evidence: "Evidencia",
    mixed: "Mixto",
  };

  return labels[focus] ?? "Mixto";
}

function getFileContribution(
  file: KnowledgeFile,
  contributions: KnowledgeDocumentContribution[],
) {
  return contributions.find(
    (contribution) =>
      contribution.sourceId === file.id ||
      contribution.fileName === file.file_name,
  );
}

export function KnowledgeQualitySummary({
  analysisJson,
  files,
}: Props) {
  const {
    qualityReport,
    documentContributions,
    sourceReferences,
    contradictions,
  } = parseQualityAnalysis(analysisJson);

  const coverage = getCoveragePercentage(
    qualityReport.sourceCoverage,
  );

  const documentCount =
    qualityReport.documentCount > 0
      ? qualityReport.documentCount
      : files.length;

  return (
    <div className="space-y-6">

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <section className="rounded-2xl border border-border bg-card p-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-foreground">
              Corpus documental
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Documentos utilizados y función que desempeñan
              dentro del conocimiento consolidado.
            </p>
          </div>

          <div className="space-y-3">
            {files.map((file) => {
              const contribution =
                getFileContribution(
                  file,
                  documentContributions,
                );

              return (
                <div
                  key={file.id}
                  className="rounded-xl border border-border bg-background p-4"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface text-muted-foreground">
                      <FileText className="h-4 w-4" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <p className="break-words text-sm font-semibold text-foreground">
                          {file.file_name}
                        </p>

                      </div>

                      <div className="mt-3 grid gap-2 sm:grid-cols-3">
                        <ContributionMeta
                          label="Rol documental"
                          value={getDocumentRoleLabel(
                            contribution?.documentRole ??
                              "reference",
                          )}
                        />

                        <ContributionMeta
                          label="Tipo de contribución"
                          value={getContributionLabel(
                            contribution?.contributionType ??
                              "reference",
                          )}
                        />

                        <ContributionMeta
                          label="Foco de contribución"
                          value={getContributionFocusLabel(
                            contribution?.contributionFocus ??
                              "mixed",
                          )}
                        />
                      </div>

                      <div className="mt-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Resumen
                        </p>

                        {contribution?.summary ? (
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          {contribution.summary}
                        </p>
                      ) : (
                        <p className="mt-2 text-sm text-muted-foreground">
                          Sin aportación documental clasificada.
                        </p>
                        )}
                      </div>

                      {contribution &&
                      contribution.supportedSections.length >
                        0 ? (
                        <div className="mt-3">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Secciones soportadas
                          </p>

                          <div className="mt-2 flex flex-wrap gap-2">
{contribution.supportedSections
  .slice(0, 5)
  .map((section) => (
    <span
      key={section}
      className="rounded-md bg-cyan-50 px-2 py-1 text-[11px] font-medium text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-300"
    >
      {getSectionLabel(section)}
    </span>
  ))}

{contribution.supportedSections.length > 5 ? (
  <span className="rounded-md bg-surface px-2 py-1 text-[11px] font-medium text-muted-foreground">
    +{contribution.supportedSections.length - 5}
  </span>
) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-foreground">
              Calidad de consolidación
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Resultado del cruce y validación de las fuentes.
            </p>
          </div>

          <div className="space-y-4">
            <QualityRow
              label="Temas duplicados fusionados"
              value={
                qualityReport.duplicateTopics.length
              }
            />

            <QualityRow
              label="Temas complementarios"
              value={
                qualityReport.complementaryTopics.length
              }
            />

            <QualityRow
              label="Afirmaciones sin respaldo"
              value={
                qualityReport.unsupportedClaims.length
              }
            />

            <QualityRow
              label="Conflictos documentales"
              value={
                qualityReport.contradictionCount
              }
            />
          </div>

          {qualityReport.confidenceNotes.length > 0 ? (
            <div className="mt-6 border-t border-border pt-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Observaciones de la IA
              </p>

              <ul className="mt-3 space-y-3">
                {qualityReport.confidenceNotes.map(
                  (note) => (
                    <li
                      key={note}
                      className="border-l-2 border-emerald-400 pl-3 text-sm leading-6 text-muted-foreground"
                    >
                      {note}
                    </li>
                  ),
                )}
              </ul>
            </div>
          ) : null}
        </section>
      </div>

      {contradictions.length > 0 ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/50 p-6 dark:border-amber-900 dark:bg-amber-950/20">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />

            <h2 className="text-lg font-semibold text-foreground">
              Contradicciones detectadas
            </h2>
          </div>

          <div className="mt-5 space-y-4">
            {contradictions.map(
              (contradiction, index) => (
                <div
                  key={`${contradiction.topic}-${index}`}
                  className="rounded-xl border border-amber-200 bg-background p-4 dark:border-amber-900"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-foreground">
                      {contradiction.topic}
                    </p>

                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold uppercase text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                      {contradiction.severity}
                    </span>
                  </div>

                  {contradiction.description ? (
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {contradiction.description}
                    </p>
                  ) : null}

                  {contradiction.recommendedAction ? (
                    <p className="mt-3 text-sm leading-6 text-foreground">
                      <strong>Acción recomendada:</strong>{" "}
                      {
                        contradiction.recommendedAction
                      }
                    </p>
                  ) : null}
                </div>
              ),
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ContributionMeta({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface/60 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>

      <p className="mt-1 text-xs font-medium text-foreground">
        {value}
      </p>
    </div>
  );
}



function QualityRow({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background px-4 py-3">
      <span className="text-sm text-muted-foreground">
        {label}
      </span>

      <span className="text-sm font-semibold text-foreground">
        {value}
      </span>
    </div>
  );
}   

function getSectionLabel(value: string) {
  const labels: Record<string, string> = {
    summary: "Resumen",
    objective: "Objetivo",
    scope: "Alcance",
    actors: "Actores",
    prerequisites: "Requisitos previos",
    triggers: "Cuándo se aplica",
    business_rules: "Reglas de negocio",
    procedures: "Procedimiento",
    outputs: "Resultados",
    warnings: "Advertencias",
    risks: "Riesgos",
    exemptions: "Excepciones",
    exceptions: "Excepciones",
    indicators: "Indicadores",
    common_questions: "Preguntas frecuentes",
    common_errors: "Errores frecuentes",
    procedure_timing: "Plazos",
    roles: "Responsables",
    criteria: "Criterios",
    classification: "Clasificación",
    evaluation_ESG: "Evaluación ESG",
    evaluation_esg: "Evaluación ESG",
    validity: "Vigencia",
    suspension: "Suspensión",
    revocation: "Revocación",
    data_requirements: "Datos requeridos",
    documentation: "Documentación",
    validation: "Validaciones",
    rejection_conditions: "Causas de rechazo",
  };

  if (labels[value]) {
    return labels[value];
  }

  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    );
}
