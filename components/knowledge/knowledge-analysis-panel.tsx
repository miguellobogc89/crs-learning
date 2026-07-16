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
  FileText,
  GitBranch,
  Info,
  ListChecks,
  Network,
  PlayCircle,
  ScrollText,
  ShieldAlert,
  UserRound,
} from "lucide-react";

import type { KnowledgeViewModel } from "@/lib/knowledge/knowledge-analysis.types";
import { parseKnowledgeAnalysis } from "@/lib/knowledge/parse-knowledge-analysis";
import { KnowledgeReviewPanel } from "@/components/knowledge/detail/summary/knowledge-review-panel";
import type { KnowledgeFile } from "@/components/knowledge/detail/knowledge-detail.types";

type PanelMode = "general" | "details";


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
    <KnowledgeReviewPanel
      analysisJson={analysisJson}
      files={files}
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

  const relatedConcepts = analysis.concepts.slice(0, 8);

  return (
    <div className="grid h-full min-h-0 lg:grid-cols-[240px_minmax(0,1fr)_280px]">
      <aside className="hidden min-h-0 border-r border-border lg:block">
        <div className="flex h-full flex-col px-5 py-6">
          <p className="shrink-0 pb-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            En este artículo
          </p>

          <nav className="min-h-0 flex-1 overflow-y-auto pr-2">
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
                      <div className="my-4 border-t border-border" />
                    ) : null}

                    {showGroup ? (
                      <p className="pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                        {item.group}
                      </p>
                    ) : null}

                    <button
                      type="button"
                      onClick={() =>
                        scrollToSection(item.id)
                      }
                      className="w-full py-2 text-left text-sm text-muted-foreground transition hover:text-foreground"
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

      <main
        id="knowledge-details-scroll"
        className="min-h-0 overflow-y-auto"
      >
        <article className="mx-auto max-w-3xl space-y-14 px-8 py-10 pb-20">
          {(hasText(analysis.summary) ||
            hasText(analysis.objective) ||
            hasText(analysis.scope)) && (
            <KnowledgeSection
              id="overview"
              icon={<BookOpen className="h-5 w-5" />}
              title="Descripción"
              description="Visión general, finalidad y alcance del artículo."
            >
              <div className="space-y-8">
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
              <div className="space-y-10">
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
              <div className="space-y-10">
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
              title="Referencias"
              description="Normativas y conocimientos necesarios para interpretar el artículo."
            >
              <div className="space-y-8">
                <RelationGroup
                  title="Normativas"
                  values={regulations}
                />

                <RelationGroup
                  title="Dependencias"
                  values={dependencies}
                />

                <RelationGroup
                  title="Aplicaciones"
                  values={applications}
                />

                <RelationGroup
                  title="Productos"
                  values={products}
                />
              </div>
            </KnowledgeSection>
          ) : null}

          {analysis.prerequisites.length > 0 ? (
            <KnowledgeSection
              id="prerequisites"
              icon={<ClipboardCheck className="h-5 w-5" />}
              title="Requisitos previos"
              description="Condiciones necesarias antes de aplicar este conocimiento."
            >
              <BulletList values={analysis.prerequisites} />
            </KnowledgeSection>
          ) : null}

          {analysis.triggers.length > 0 ? (
            <KnowledgeSection
              id="triggers"
              icon={<PlayCircle className="h-5 w-5" />}
              title="Cuándo se aplica"
              description="Situaciones que activan o hacen necesario este contenido."
            >
              <BulletList values={analysis.triggers} />
            </KnowledgeSection>
          ) : null}

          {analysis.procedures.length > 0 ? (
            <KnowledgeSection
              id="procedures"
              icon={<ListChecks className="h-5 w-5" />}
              title="Procedimiento"
              description="Secuencia operativa extraída de la documentación."
            >
              <div className="space-y-10">
                {analysis.procedures.map(
                  (procedure) => (
                    <div
                      key={`${procedure.name}-${procedure.goal}`}
                    >
                      <h3 className="text-lg font-semibold text-foreground">
                        {procedure.name || "Procedimiento"}
                      </h3>

                      {procedure.goal ? (
                        <p className="mt-2 text-sm leading-7 text-muted-foreground">
                          {procedure.goal}
                        </p>
                      ) : null}

                      {procedure.steps.length > 0 ? (
                        <ol className="mt-7 space-y-7">
                          {procedure.steps.map(
                            (step, index) => (
                              <li
                                key={`${step.order}-${step.title}-${index}`}
                                className="grid gap-4 sm:grid-cols-[32px_minmax(0,1fr)]"
                              >
                                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-600 text-xs font-semibold text-white">
                                  {step.order || index + 1}
                                </span>

                                <div>
                                  <p className="font-semibold text-foreground">
                                    {step.title}
                                  </p>

                                  {step.instruction ? (
                                    <p className="mt-2 text-sm leading-7 text-muted-foreground">
                                      {step.instruction}
                                    </p>
                                  ) : null}

                                  {step.expectedResult ? (
                                    <p className="mt-2 text-xs leading-6 text-muted-foreground">
                                      <strong className="font-semibold text-foreground">
                                        Resultado esperado:
                                      </strong>{" "}
                                      {step.expectedResult}
                                    </p>
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
              icon={<ScrollText className="h-5 w-5" />}
              title="Reglas de negocio"
              description="Restricciones y criterios que deben cumplirse."
            >
              <BulletList values={analysis.businessRules} />
            </KnowledgeSection>
          ) : null}

          {analysis.warnings.length > 0 ? (
            <KnowledgeSection
              id="warnings"
              icon={<ShieldAlert className="h-5 w-5" />}
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
              icon={<CheckCircle2 className="h-5 w-5" />}
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
              icon={<AlertTriangle className="h-5 w-5" />}
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
              icon={<CircleHelp className="h-5 w-5" />}
              title="Preguntas frecuentes"
              description="Dudas habituales relacionadas con el artículo."
            >
              <div className="space-y-4">
                {analysis.commonQuestions.map(
                  (question) => (
                    <p
                      key={question}
                      className="text-sm leading-7 text-foreground"
                    >
                      {question}
                    </p>
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
              <div className="space-y-6">
                {analysis.glossary.map((item) => (
                  <TextBlock
                    key={`${item.term}-${item.definition}`}
                    title={item.term}
                    value={item.definition}
                  />
                ))}
              </div>
            </KnowledgeSection>
          ) : null}
        </article>
      </main>

      <aside className="hidden min-h-0 border-l border-border lg:block">
        <div className="flex h-full flex-col px-5 py-6">
          <p className="shrink-0 pb-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Relacionados
          </p>

<nav className="min-h-0 flex-1 overflow-y-auto pl-1">
  <p className="text-sm leading-6 text-muted-foreground">
    Todavía no hay artículos relacionados.
  </p>
</nav>
        </div>
      </aside>
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
      className="scroll-mt-8 border-b border-border pb-14 last:border-b-0"
    >
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <span className="text-cyan-600">
            {icon}
          </span>

          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            {title}
          </h2>
        </div>

        {description ? (
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        ) : null}
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
    <div className="border-l-2 border-cyan-500 pl-4">
      <p className="font-semibold text-foreground">
        {title || "Sin título"}
      </p>

      {description ? (
        <p className="mt-1 text-sm leading-7 text-muted-foreground">
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

      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {values.map((value) => (
          <span
            key={value}
            className="text-sm text-muted-foreground"
          >
            #{value}
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
    <ul className="space-y-5">
      {values.map((value) => (
        <li
          key={value}
          className={[
            "border-l-2 pl-4 text-sm leading-7",
            variant === "warning"
              ? "border-amber-400 text-amber-900"
              : "",
            variant === "danger"
              ? "border-red-400 text-red-900"
              : "",
            variant === "success"
              ? "border-emerald-400 text-emerald-900"
              : "",
            variant === "default"
              ? "border-border text-muted-foreground"
              : "",
          ].join(" ")}
        >
          {value}
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

      <ul className="space-y-2">
        {values.map((value) => (
          <li
            key={value}
            className="border-l-2 border-border pl-4 text-sm leading-7 text-muted-foreground"
          >
            {value}
          </li>
        ))}
      </ul>
    </div>
  );
}