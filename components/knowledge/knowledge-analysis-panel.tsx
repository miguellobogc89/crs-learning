// components/knowledge/knowledge-analysis-panel.tsx
"use client";

import type { ReactNode } from "react";
import {
  AlertTriangle,
  BookOpen,
  Box,
  CalendarDays,
  CheckCircle2,
  CircleHelp,
  ClipboardCheck,
  FileStack,
  FileText,
  GitBranch,
  Info,
  ListChecks,
  Network,
  PlayCircle,
  ScrollText,
  ShieldAlert,
  Sparkles,
  UserRound,
} from "lucide-react";

import type { KnowledgeViewModel } from "@/lib/knowledge/knowledge-analysis.types";
import { parseKnowledgeAnalysis } from "@/lib/knowledge/parse-knowledge-analysis";

type PanelMode = "general" | "details";

type KnowledgeFile = {
  id: string;
  file_name: string;
  file_size: number | null;
  status: string;
};

type RelatedDocument = {
  title: string;
  relationship: string;
  reason: string;
};

type KnowledgeGraph = {
  applications: unknown;
  products: unknown;
  regulations: unknown;
  dependencies: unknown;
  related_documents: unknown;
};

type Props = {
  mode: PanelMode;
  analysisJson: unknown;
  status?: string | null;
  model?: string | null;
  knowledgeType?: string | null;
  graph?: KnowledgeGraph | null;
  files: KnowledgeFile[];
};

type NavigationItem = {
  id: string;
  label: string;
  group: string;
};

function hasText(value: string | null | undefined) {
  return Boolean(value?.trim());
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

function toRelatedDocuments(
  value: unknown,
): RelatedDocument[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (
        item,
      ): item is {
        title: unknown;
        relationship: unknown;
        reason: unknown;
      } =>
        typeof item === "object" &&
        item !== null &&
        "title" in item &&
        "relationship" in item &&
        "reason" in item,
    )
    .map((item) => ({
      title:
        typeof item.title === "string"
          ? item.title
          : "",
      relationship:
        typeof item.relationship === "string"
          ? item.relationship
          : "",
      reason:
        typeof item.reason === "string"
          ? item.reason
          : "",
    }))
    .filter((item) => item.title.trim().length > 0);
}

function getConfidencePercentage(confidence: number) {
  if (confidence <= 0) {
    return null;
  }

  if (confidence <= 1) {
    return Math.round(confidence * 100);
  }

  return Math.round(confidence);
}

function getTypeLabel(
  detectedType: string,
  knowledgeType: string | null | undefined,
) {
  const value =
    detectedType || knowledgeType || "unknown";

  const labels: Record<string, string> = {
    procedure: "Procedimiento",
    procedimiento: "Procedimiento",
    contract: "Contrato",
    contrato: "Contrato",
    technical: "Documentación técnica",
    technical_documentation: "Documentación técnica",
    training: "Formación",
    formacion: "Formación",
    policy: "Política",
    politica: "Política",
    best_practice: "Buenas prácticas",
    best_practices: "Buenas prácticas",
    regulation: "Normativa",
    guide: "Guía",
    unknown: "Artículo de conocimiento",
  };

  return labels[value.toLowerCase()] ?? value;
}

function getAnalysisStatusLabel(
  status: string | null | undefined,
) {
  if (status === "processing") {
    return "Procesando";
  }

  if (status === "error") {
    return "Error";
  }

  if (
    status === "completed" ||
    status === "processed" ||
    status === "ready"
  ) {
    return "Analizado";
  }

  return "Analizado";
}

function scrollToSection(id: string) {
  const element = document.getElementById(id);

  if (!element) {
    return;
  }

  element.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

function buildNavigation(
  analysis: KnowledgeViewModel,
  relationsCount: number,
): NavigationItem[] {
  const items: NavigationItem[] = [];

  if (
    hasText(analysis.summary) ||
    hasText(analysis.objective) ||
    hasText(analysis.scope)
  ) {
    items.push({
      id: "overview",
      label: "Descripción",
      group: "General",
    });
  }

  if (
    analysis.systems.length > 0 ||
    analysis.actors.length > 0 ||
    analysis.importantDates.length > 0
  ) {
    items.push({
      id: "key-information",
      label: "Información clave",
      group: "General",
    });
  }

  if (
    analysis.topics.length > 0 ||
    analysis.concepts.length > 0
  ) {
    items.push({
      id: "context",
      label: "Contexto y conceptos",
      group: "General",
    });
  }

  if (relationsCount > 0) {
    items.push({
      id: "relations",
      label: "Relaciones",
      group: "General",
    });
  }

  if (analysis.prerequisites.length > 0) {
    items.push({
      id: "prerequisites",
      label: "Requisitos previos",
      group: "Contenido",
    });
  }

  if (analysis.triggers.length > 0) {
    items.push({
      id: "triggers",
      label: "Cuándo se aplica",
      group: "Contenido",
    });
  }

  if (analysis.procedures.length > 0) {
    items.push({
      id: "procedures",
      label: "Procedimiento",
      group: "Contenido",
    });
  }

  if (analysis.businessRules.length > 0) {
    items.push({
      id: "business-rules",
      label: "Reglas de negocio",
      group: "Contenido",
    });
  }

  if (analysis.warnings.length > 0) {
    items.push({
      id: "warnings",
      label: "Advertencias",
      group: "Contenido",
    });
  }

  if (analysis.outputs.length > 0) {
    items.push({
      id: "results",
      label: "Resultados esperados",
      group: "Validación",
    });
  }

  if (analysis.commonErrors.length > 0) {
    items.push({
      id: "common-errors",
      label: "Errores frecuentes",
      group: "Validación",
    });
  }

  if (analysis.commonQuestions.length > 0) {
    items.push({
      id: "faq",
      label: "Preguntas frecuentes",
      group: "Validación",
    });
  }

  if (analysis.glossary.length > 0) {
    items.push({
      id: "glossary",
      label: "Glosario",
      group: "Referencia",
    });
  }

  return items;
}

export function KnowledgeAnalysisPanel({
  mode,
  analysisJson,
  status,
  model,
  knowledgeType,
  graph,
  files,
}: Props) {
  const analysis = parseKnowledgeAnalysis(
    analysisJson as Parameters<
      typeof parseKnowledgeAnalysis
    >[0],
  );

  if (status === "processing") {
    return <ProcessingState />;
  }

  if (status === "error") {
    return <ErrorState />;
  }

  if (!analysis) {
    return <EmptyState />;
  }

  const applications = toStringArray(
    graph?.applications,
  );
  const products = toStringArray(graph?.products);
  const regulations = toStringArray(
    graph?.regulations,
  );
  const dependencies = toStringArray(
    graph?.dependencies,
  );
  const relatedDocuments = toRelatedDocuments(
    graph?.related_documents,
  );

  const relationsCount =
    applications.length +
    products.length +
    regulations.length +
    dependencies.length +
    relatedDocuments.length;

  if (mode === "general") {
    return (
      <GeneralView
        analysis={analysis}
        status={status}
        model={model}
        knowledgeType={knowledgeType}
        files={files}
        relationsCount={relationsCount}
        applications={applications}
        products={products}
        regulations={regulations}
        dependencies={dependencies}
      />
    );
  }

  return (
    <DetailsView
      analysis={analysis}
      relationsCount={relationsCount}
      applications={applications}
      products={products}
      regulations={regulations}
      dependencies={dependencies}
      relatedDocuments={relatedDocuments}
    />
  );
}

function GeneralView({
  analysis,
  status,
  model,
  knowledgeType,
  files,
  relationsCount,
  applications,
  products,
  regulations,
  dependencies,
}: {
  analysis: KnowledgeViewModel;
  status?: string | null;
  model?: string | null;
  knowledgeType?: string | null;
  files: KnowledgeFile[];
  relationsCount: number;
  applications: string[];
  products: string[];
  regulations: string[];
  dependencies: string[];
}) {
  const confidence = getConfidencePercentage(
    analysis.meta.confidence,
  );

  const typeLabel = getTypeLabel(
    analysis.detectedType,
    knowledgeType,
  );

  const primaryRelations = [
    ...applications,
    ...products,
    ...regulations,
    ...dependencies,
  ].slice(0, 8);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border bg-surface/40 px-6 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-lesson" />

            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Qué debes saber
            </p>
          </div>
        </div>

        <div className="px-6 py-7 md:px-8 md:py-8">
          <div className="max-w-4xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-lesson-soft px-3 py-1 text-xs font-semibold text-lesson">
                {typeLabel}
              </span>

              {analysis.meta.domain ? (
                <span className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
                  {analysis.meta.domain}
                </span>
              ) : null}

              {analysis.meta.level ? (
                <span className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
                  {analysis.meta.level}
                </span>
              ) : null}
            </div>

            <h2 className="mt-5 text-2xl font-semibold tracking-tight text-foreground">
              {analysis.objective ||
                "Propósito del artículo"}
            </h2>

            <p className="mt-3 text-base leading-8 text-muted-foreground">
              {analysis.summary ||
                "Este artículo reúne conocimiento estructurado a partir de sus documentos fuente."}
            </p>

            {analysis.scope ? (
              <div className="mt-5 rounded-xl border border-border bg-background px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Alcance
                </p>

                <p className="mt-1 text-sm leading-6 text-foreground">
                  {analysis.scope}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <GeneralMetric
          label="Confianza IA"
          value={
            confidence !== null
              ? `${confidence} %`
              : "Sin calcular"
          }
          description="Fiabilidad del análisis"
        />

        <GeneralMetric
          label="Documentos fuente"
          value={String(files.length)}
          description="Evidencias vinculadas"
        />

        <GeneralMetric
          label="Relaciones"
          value={String(relationsCount)}
          description="Conexiones detectadas"
        />

        <GeneralMetric
          label="Estado"
          value={getAnalysisStatusLabel(status)}
          description={model ?? "Análisis IA"}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <section className="rounded-2xl border border-border bg-card p-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-foreground">
              Aportación documental
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Peso de cada documento en la construcción del
              artículo.
            </p>
          </div>

          {files.length > 0 ? (
            <div className="space-y-3">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="rounded-xl border border-border bg-background p-4"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface text-muted-foreground">
                      <FileText className="h-4 w-4" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {file.file_name}
                        </p>

                        <span className="shrink-0 text-xs font-medium text-muted-foreground">
                          Pendiente de calcular
                        </span>
                      </div>

                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface">
                        <div className="h-full w-0 rounded-full bg-lesson" />
                      </div>

                      <p className="mt-2 text-xs text-muted-foreground">
                        La siguiente versión del análisis
                        determinará qué secciones respalda este
                        documento y su porcentaje de aportación.
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-8 text-center">
              <FileStack className="mx-auto h-6 w-6 text-muted-foreground" />

              <p className="mt-3 text-sm font-medium text-foreground">
                No hay documentos vinculados.
              </p>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-foreground">
              Relaciones principales
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Entornos y elementos conectados con este artículo.
            </p>
          </div>

          {primaryRelations.length > 0 ? (
            <div className="space-y-3">
              {primaryRelations.map((relation) => (
                <div
                  key={relation}
                  className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface text-muted-foreground">
                    <GitBranch className="h-4 w-4" />
                  </span>

                  <span className="text-sm font-medium text-foreground">
                    {relation}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-8 text-center">
              <GitBranch className="mx-auto h-6 w-6 text-muted-foreground" />

              <p className="mt-3 text-sm font-medium text-foreground">
                No se han detectado relaciones.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function DetailsView({
  analysis,
  relationsCount,
  applications,
  products,
  regulations,
  dependencies,
  relatedDocuments,
}: {
  analysis: KnowledgeViewModel;
  relationsCount: number;
  applications: string[];
  products: string[];
  regulations: string[];
  dependencies: string[];
  relatedDocuments: RelatedDocument[];
}) {
  const navigation = buildNavigation(
    analysis,
    relationsCount,
  );

  return (
    <div className="grid h-full min-h-0 items-stretch gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
      <aside className="hidden min-h-0 lg:block">
        <div className="flex h-full flex-col rounded-xl border border-border bg-card p-3">
          <p className="shrink-0 px-3 pb-3 pt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            En este artículo
          </p>

          <nav className="min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="space-y-1">
              {navigation.map((item, index) => {
                const previousGroup =
                  index > 0
                    ? navigation[index - 1].group
                    : null;

                const showGroup =
                  item.group !== previousGroup;

                return (
                  <div key={item.id}>
                    {showGroup && index > 0 ? (
                      <div className="my-3 border-t border-border" />
                    ) : null}

                    {showGroup ? (
                      <p className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                        {item.group}
                      </p>
                    ) : null}

                    <button
                      type="button"
                      onClick={() =>
                        scrollToSection(item.id)
                      }
                      className="w-full rounded-lg px-3 py-2 text-left text-sm text-muted-foreground transition hover:bg-surface hover:text-foreground"
                    >
                      {item.label}
                    </button>
                  </div>
                );
              })}
            </div>
          </nav>
        </div>
      </aside>

      <div
        id="knowledge-details-scroll"
        className="min-h-0 overflow-y-auto pr-1"
      >
        <div className="space-y-6 pb-8">
          {(hasText(analysis.summary) ||
            hasText(analysis.objective) ||
            hasText(analysis.scope)) && (
            <KnowledgeSection
              id="overview"
              icon={<BookOpen className="h-5 w-5" />}
              title="Descripción"
              description="Visión general, finalidad y alcance del artículo."
            >
              <div className="space-y-6">
                {analysis.summary ? (
                  <TextBlock
                    title="Resumen"
                    value={analysis.summary}
                  />
                ) : null}

                {analysis.objective ? (
                  <TextBlock
                    title="Objetivo"
                    value={analysis.objective}
                  />
                ) : null}

                {analysis.scope ? (
                  <TextBlock
                    title="Alcance"
                    value={analysis.scope}
                  />
                ) : null}
              </div>
            </KnowledgeSection>
          )}

          {(analysis.systems.length > 0 ||
            analysis.actors.length > 0 ||
            analysis.importantDates.length > 0) && (
            <KnowledgeSection
              id="key-information"
              icon={<Info className="h-5 w-5" />}
              title="Información clave"
              description="Entornos, personas y fechas relevantes."
            >
              <div className="space-y-8">
                {analysis.systems.length > 0 ? (
                  <CardGrid
                    title="Sistemas y entornos"
                    icon={<Box className="h-4 w-4" />}
                  >
                    {analysis.systems.map((system) => (
                      <InformationCard
                        key={`${system.name}-${system.description}`}
                        title={system.name}
                        description={system.description}
                      />
                    ))}
                  </CardGrid>
                ) : null}

                {analysis.actors.length > 0 ? (
                  <CardGrid
                    title="Actores"
                    icon={<UserRound className="h-4 w-4" />}
                  >
                    {analysis.actors.map((actor) => (
                      <InformationCard
                        key={`${actor.name}-${actor.role}`}
                        title={actor.name}
                        description={actor.role}
                      />
                    ))}
                  </CardGrid>
                ) : null}

                {analysis.importantDates.length > 0 ? (
                  <CardGrid
                    title="Fechas importantes"
                    icon={
                      <CalendarDays className="h-4 w-4" />
                    }
                  >
                    {analysis.importantDates.map(
                      (date) => (
                        <InformationCard
                          key={`${date.label}-${date.value}`}
                          title={date.label}
                          description={date.value}
                        />
                      ),
                    )}
                  </CardGrid>
                ) : null}
              </div>
            </KnowledgeSection>
          )}

          {(analysis.topics.length > 0 ||
            analysis.concepts.length > 0) && (
            <KnowledgeSection
              id="context"
              icon={<Network className="h-5 w-5" />}
              title="Contexto y conceptos"
              description="Temas principales y vocabulario necesario para interpretar el contenido."
            >
              <div className="space-y-8">
                {analysis.topics.length > 0 ? (
                  <TagGroup
                    title="Temas principales"
                    values={analysis.topics}
                  />
                ) : null}

                {analysis.concepts.length > 0 ? (
                  <CardGrid title="Conceptos">
                    {analysis.concepts.map((concept) => (
                      <InformationCard
                        key={`${concept.name}-${concept.definition}`}
                        title={concept.name}
                        description={concept.definition}
                      />
                    ))}
                  </CardGrid>
                ) : null}
              </div>
            </KnowledgeSection>
          )}

          {relationsCount > 0 ? (
            <KnowledgeSection
              id="relations"
              icon={<GitBranch className="h-5 w-5" />}
              title="Relaciones"
              description="Sistemas, dependencias y documentos conectados con este artículo."
            >
              <div className="space-y-8">
                <div className="grid gap-6 md:grid-cols-2">
                  <RelationGroup
                    title="Aplicaciones"
                    values={applications}
                  />

                  <RelationGroup
                    title="Productos"
                    values={products}
                  />

                  <RelationGroup
                    title="Normativas"
                    values={regulations}
                  />

                  <RelationGroup
                    title="Dependencias"
                    values={dependencies}
                  />
                </div>

                {relatedDocuments.length > 0 ? (
                  <div>
                    <h3 className="mb-3 text-sm font-semibold text-foreground">
                      Documentos relacionados
                    </h3>

                    <div className="space-y-3">
                      {relatedDocuments.map(
                        (document) => (
                          <div
                            key={`${document.title}-${document.relationship}`}
                            className="rounded-xl border border-border bg-background p-4"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <p className="font-semibold text-foreground">
                                {document.title}
                              </p>

                              {document.relationship ? (
                                <span className="rounded-full bg-surface px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                                  {
                                    document.relationship
                                  }
                                </span>
                              ) : null}
                            </div>

                            {document.reason ? (
                              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                                {document.reason}
                              </p>
                            ) : null}
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </KnowledgeSection>
          ) : null}

          {analysis.prerequisites.length > 0 ? (
            <KnowledgeSection
              id="prerequisites"
              icon={
                <ClipboardCheck className="h-5 w-5" />
              }
              title="Requisitos previos"
              description="Condiciones necesarias antes de aplicar este conocimiento."
            >
              <BulletList
                values={analysis.prerequisites}
              />
            </KnowledgeSection>
          ) : null}

          {analysis.triggers.length > 0 ? (
            <KnowledgeSection
              id="triggers"
              icon={
                <PlayCircle className="h-5 w-5" />
              }
              title="Cuándo se aplica"
              description="Situaciones que activan o hacen necesario este contenido."
            >
              <BulletList values={analysis.triggers} />
            </KnowledgeSection>
          ) : null}

          {analysis.procedures.length > 0 ? (
            <KnowledgeSection
              id="procedures"
              icon={
                <ListChecks className="h-5 w-5" />
              }
              title="Procedimiento"
              description="Secuencia operativa extraída de la documentación."
            >
              <div className="space-y-6">
                {analysis.procedures.map(
                  (procedure) => (
                    <div
                      key={`${procedure.name}-${procedure.goal}`}
                      className="rounded-xl border border-border bg-background p-5"
                    >
                      <h3 className="text-base font-semibold text-foreground">
                        {procedure.name ||
                          "Procedimiento"}
                      </h3>

                      {procedure.goal ? (
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          {procedure.goal}
                        </p>
                      ) : null}

                      {procedure.steps.length > 0 ? (
                        <ol className="mt-6 space-y-5">
                          {procedure.steps.map(
                            (step, index) => (
                              <li
                                key={`${step.order}-${step.title}-${index}`}
                                className="grid gap-3 sm:grid-cols-[32px_minmax(0,1fr)]"
                              >
                                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">
                                  {step.order ||
                                    index + 1}
                                </span>

                                <div className="pt-1">
                                  <p className="font-semibold text-foreground">
                                    {step.title}
                                  </p>

                                  {step.instruction ? (
                                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                                      {
                                        step.instruction
                                      }
                                    </p>
                                  ) : null}

                                  {step.expectedResult ? (
                                    <div className="mt-2 flex items-start gap-2 rounded-lg bg-surface px-3 py-2 text-xs text-muted-foreground">
                                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />

                                      <span>
                                        <strong className="font-semibold text-foreground">
                                          Resultado
                                          esperado:
                                        </strong>{" "}
                                        {
                                          step.expectedResult
                                        }
                                      </span>
                                    </div>
                                  ) : null}
                                </div>
                              </li>
                            ),
                          )}
                        </ol>
                      ) : null}
                    </div>
                  ),
                )}
              </div>
            </KnowledgeSection>
          ) : null}

          {analysis.businessRules.length > 0 ? (
            <KnowledgeSection
              id="business-rules"
              icon={
                <ScrollText className="h-5 w-5" />
              }
              title="Reglas de negocio"
              description="Restricciones y criterios que deben cumplirse."
            >
              <BulletList
                values={analysis.businessRules}
              />
            </KnowledgeSection>
          ) : null}

          {analysis.warnings.length > 0 ? (
            <KnowledgeSection
              id="warnings"
              icon={
                <ShieldAlert className="h-5 w-5" />
              }
              title="Advertencias"
              description="Riesgos, excepciones y puntos que requieren atención."
            >
              <BulletList
                values={analysis.warnings}
                variant="warning"
              />
            </KnowledgeSection>
          ) : null}

          {analysis.outputs.length > 0 ? (
            <KnowledgeSection
              id="results"
              icon={
                <CheckCircle2 className="h-5 w-5" />
              }
              title="Resultados esperados"
              description="Qué debe obtenerse al aplicar correctamente el contenido."
            >
              <BulletList
                values={analysis.outputs}
                variant="success"
              />
            </KnowledgeSection>
          ) : null}

          {analysis.commonErrors.length > 0 ? (
            <KnowledgeSection
              id="common-errors"
              icon={
                <AlertTriangle className="h-5 w-5" />
              }
              title="Errores frecuentes"
              description="Problemas habituales detectados en la documentación."
            >
              <BulletList
                values={analysis.commonErrors}
                variant="danger"
              />
            </KnowledgeSection>
          ) : null}

          {analysis.commonQuestions.length > 0 ? (
            <KnowledgeSection
              id="faq"
              icon={
                <CircleHelp className="h-5 w-5" />
              }
              title="Preguntas frecuentes"
              description="Dudas habituales relacionadas con el artículo."
            >
              <div className="space-y-2">
                {analysis.commonQuestions.map(
                  (question) => (
                    <div
                      key={question}
                      className="rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground"
                    >
                      {question}
                    </div>
                  ),
                )}
              </div>
            </KnowledgeSection>
          ) : null}

          {analysis.glossary.length > 0 ? (
            <KnowledgeSection
              id="glossary"
              icon={<FileText className="h-5 w-5" />}
              title="Glosario"
              description="Términos y definiciones relevantes."
            >
              <div className="grid gap-3 md:grid-cols-2">
                {analysis.glossary.map((item) => (
                  <InformationCard
                    key={`${item.term}-${item.definition}`}
                    title={item.term}
                    description={item.definition}
                  />
                ))}
              </div>
            </KnowledgeSection>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ProcessingState() {
  return (
    <div className="rounded-2xl border border-border bg-panel p-8">
      <p className="text-sm font-semibold text-foreground">
        Analizando el artículo…
      </p>

      <p className="mt-1 text-sm text-muted-foreground">
        La IA está estructurando el conocimiento y
        detectando sus secciones.
      </p>

      <div className="mt-5 h-2 overflow-hidden rounded-full bg-surface">
        <div className="h-full w-2/3 animate-pulse rounded-full bg-brand" />
      </div>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-8">
      <p className="font-semibold text-red-700">
        El análisis del artículo ha fallado.
      </p>

      <p className="mt-1 text-sm text-red-600">
        Vuelve a procesar el artículo desde el menú de
        opciones.
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-panel p-10 text-center">
      <p className="font-semibold text-foreground">
        Todavía no hay análisis disponible.
      </p>

      <p className="mt-1 text-sm text-muted-foreground">
        Guarda o reprocesa este artículo para generar su
        estructura de conocimiento.
      </p>
    </div>
  );
}

function GeneralMetric({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>

      <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
        {value}
      </p>

      <p className="mt-1 truncate text-xs text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function KnowledgeSection({
  id,
  icon,
  title,
  description,
  children,
}: {
  id: string;
  icon: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-6 rounded-2xl border border-border bg-card p-6"
    >
      <div className="mb-6 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface text-foreground">
          {icon}
        </span>

        <div>
          <h2 className="text-lg font-semibold text-foreground">
            {title}
          </h2>

          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </div>

      {children}
    </section>
  );
}

function TextBlock({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground">
        {title}
      </h3>

      <p className="mt-2 whitespace-pre-line text-sm leading-7 text-muted-foreground">
        {value}
      </p>
    </div>
  );
}

function CardGrid({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        {icon}

        <h3 className="text-sm font-semibold text-foreground">
          {title}
        </h3>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {children}
      </div>
    </div>
  );
}

function InformationCard({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <p className="font-semibold text-foreground">
        {title || "Sin título"}
      </p>

      {description ? (
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  );
}

function TagGroup({
  title,
  values,
}: {
  title: string;
  values: string[];
}) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-foreground">
        {title}
      </h3>

      <div className="flex flex-wrap gap-2">
        {values.map((value) => (
          <span
            key={value}
            className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-foreground"
          >
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}

function BulletList({
  values,
  variant = "default",
}: {
  values: string[];
  variant?:
    | "default"
    | "warning"
    | "danger"
    | "success";
}) {
  return (
    <ul className="space-y-3">
      {values.map((value) => (
        <li
          key={value}
          className={[
            "flex items-start gap-3 rounded-xl border px-4 py-3 text-sm leading-6",
            variant === "warning"
              ? "border-amber-200 bg-amber-50 text-amber-950"
              : "",
            variant === "danger"
              ? "border-red-200 bg-red-50 text-red-950"
              : "",
            variant === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-950"
              : "",
            variant === "default"
              ? "border-border bg-background text-foreground"
              : "",
          ].join(" ")}
        >
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-current" />

          <span>{value}</span>
        </li>
      ))}
    </ul>
  );
}

function RelationGroup({
  title,
  values,
}: {
  title: string;
  values: string[];
}) {
  if (values.length === 0) {
    return null;
  }

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-foreground">
        {title}
      </h3>

      <div className="flex flex-wrap gap-2">
        {values.map((value) => (
          <span
            key={value}
            className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-foreground"
          >
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}