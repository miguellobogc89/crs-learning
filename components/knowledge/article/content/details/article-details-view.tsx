
// components/knowledge/article/content/details/article-details-view.tsx

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
  FileSearch,
  GitBranch,
  Info,
  ListChecks,
  Loader2,
  Network,
  PlayCircle,
  RefreshCw,
  ScrollText,
  ShieldAlert,
  Table2,
  UserCheck,
  UserRound,
  BrainCircuit,
} from "lucide-react";

import { parseKnowledgeAnalysis } from
  "@/lib/knowledge/parse-knowledge-analysis";

import type {
  KnowledgeFile,
  KnowledgeGraph,
} from "@/components/knowledge/detail/knowledge-detail.types";

type ArticleDetailsViewProps = {
  hasDocuments: boolean;
  hasAnalysis: boolean;
  isRebuilding: boolean;
  rebuildError: string | null;
  knowledgeType: string;
  analysisJson: unknown;
  analysisStatus: string | null;
  analysisModel: string | null;
  graph: KnowledgeGraph | null;
  files: KnowledgeFile[];
  onRebuild: () => void;
};

type ContentSectionProps = {
  id: string;
  title: string;
  description?: string;
  icon: ReactNode;
  children: ReactNode;
};

function ContentSection({
  id,
  title,
  description,
  icon,
  children,
}: ContentSectionProps) {
  return (
    <section id={id}>
      <header>
        <span aria-hidden="true">{icon}</span>

        <h2>{title}</h2>

        {description && <p>{description}</p>}
      </header>

      <div>{children}</div>
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
  if (!value.trim()) {
    return null;
  }

  return (
    <div>
      <h3>{title}</h3>
      <p>{value}</p>
    </div>
  );
}

function TextList({
  values,
}: {
  values: string[];
}) {
  const items = values.filter((value) => value.trim());

  if (items.length === 0) {
    return null;
  }

  return (
    <ul>
      {items.map((value, index) => (
        <li key={`${value}-${index}`}>{value}</li>
      ))}
    </ul>
  );
}

function NamedItems({
  title,
  items,
}: {
  title: string;
  items: Array<{
    name: string;
    description: string;
  }>;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div>
      <h3>{title}</h3>

      {items.map((item, index) => (
        <div key={`${item.name}-${index}`}>
          <h4>{item.name}</h4>
          {item.description && <p>{item.description}</p>}
        </div>
      ))}
    </div>
  );
}

function StringGroup({
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
      <h3>{title}</h3>
      <TextList values={values} />
    </div>
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

export function ArticleDetailsView({
  hasDocuments,
  hasAnalysis,
  isRebuilding,
  rebuildError,
  analysisJson,
  analysisStatus,
  graph,
  onRebuild,
}: ArticleDetailsViewProps) {
  if (!hasDocuments) {
    return (
      <section>
        <FileSearch aria-hidden="true" />

        <h2>Añade documentación para generar el análisis</h2>

        <p>
          La incorporación de nuevas evidencias se realiza
          desde el flujo de Importación de Conocimiento
          de la carpeta.
        </p>
      </section>
    );
  }

  if (!hasAnalysis) {
    return (
      <section>
        <BrainCircuit aria-hidden="true" />

        <h2>Todavía no hay un análisis disponible</h2>

        <p>
          Procesa la documentación del artículo para generar
          su análisis detallado y extraer la estructura
          de conocimiento.
        </p>

        <button
          type="button"
          disabled={isRebuilding}
          onClick={onRebuild}
        >
          {isRebuilding ? (
            <Loader2 aria-hidden="true" />
          ) : (
            <RefreshCw aria-hidden="true" />
          )}

          {isRebuilding
            ? "Actualizando..."
            : "Actualizar conocimiento"}
        </button>

        {rebuildError && (
          <p role="alert">{rebuildError}</p>
        )}
      </section>
    );
  }

  if (analysisStatus === "processing") {
    return (
      <section>
        <Loader2 aria-hidden="true" />
        <h2>Procesando documentación</h2>
        <p>El análisis del artículo está en curso.</p>
      </section>
    );
  }

  if (analysisStatus === "error") {
    return (
      <section>
        <AlertTriangle aria-hidden="true" />
        <h2>No se ha podido completar el análisis</h2>
        <p>
          Vuelve a procesar la documentación para
          generar el contenido del artículo.
        </p>
      </section>
    );
  }

  const analysis = parseKnowledgeAnalysis(
    analysisJson as Parameters<
      typeof parseKnowledgeAnalysis
    >[0],
  );

  if (!analysis) {
    return (
      <section>
        <BrainCircuit aria-hidden="true" />
        <h2>Análisis no disponible</h2>
        <p>
          No se ha podido interpretar el análisis
          de este artículo.
        </p>
      </section>
    );
  }

  const applications = toStringArray(graph?.applications);
  const products = toStringArray(graph?.products);
  const regulations = toStringArray(graph?.regulations);
  const dependencies = toStringArray(graph?.dependencies);

  const hasReferences =
    applications.length > 0 ||
    products.length > 0 ||
    regulations.length > 0 ||
    dependencies.length > 0;

  return (
    <>
      {(analysis.objective || analysis.scope) && (
        <ContentSection
          id="overview"
          title="Descripción"
          description="Visión general, finalidad y alcance del artículo."
          icon={<BookOpen />}
        >
          <TextBlock
            title="Objetivo"
            value={analysis.objective}
          />

          <TextBlock
            title="Alcance"
            value={analysis.scope}
          />
        </ContentSection>
      )}

      {(analysis.systems.length > 0 ||
        analysis.actors.length > 0 ||
        analysis.importantDates.length > 0) && (
        <ContentSection
          id="key-information"
          title="Información clave"
          description="Entornos, personas y fechas relevantes."
          icon={<Info />}
        >
          <NamedItems
            title="Sistemas y entornos"
            items={analysis.systems.map((system) => ({
              name: system.name,
              description: system.description,
            }))}
          />

          <NamedItems
            title="Actores"
            items={analysis.actors.map((actor) => ({
              name: actor.name,
              description: actor.role,
            }))}
          />

          {analysis.importantDates.length > 0 && (
            <div>
              <h3>
                <CalendarDays aria-hidden="true" />
                Fechas importantes
              </h3>

              {analysis.importantDates.map((date, index) => (
                <div key={`${date.label}-${index}`}>
                  <h4>{date.label}</h4>
                  <p>{date.value}</p>
                </div>
              ))}
            </div>
          )}
        </ContentSection>
      )}

      {(analysis.topics.length > 0 ||
        analysis.concepts.length > 0) && (
        <ContentSection
          id="context"
          title="Contexto y conceptos"
          description="Temas principales y vocabulario del artículo."
          icon={<Network />}
        >
          <StringGroup
            title="Temas principales"
            values={analysis.topics}
          />

          <NamedItems
            title="Conceptos"
            items={analysis.concepts.map((concept) => ({
              name: concept.name,
              description: concept.definition,
            }))}
          />
        </ContentSection>
      )}

      {hasReferences && (
        <ContentSection
          id="relations"
          title="Referencias"
          description="Normativas y conocimientos relacionados con el artículo."
          icon={<GitBranch />}
        >
          <StringGroup
            title="Normativas"
            values={regulations}
          />

          <StringGroup
            title="Dependencias"
            values={dependencies}
          />

          <StringGroup
            title="Aplicaciones"
            values={applications}
          />

          <StringGroup
            title="Productos"
            values={products}
          />
        </ContentSection>
      )}

      {analysis.responsibilities.length > 0 && (
        <ContentSection
          id="responsibilities"
          title="Responsables"
          description="Acciones y responsables identificados en la documentación."
          icon={<UserCheck />}
        >
          <table>
            <thead>
              <tr>
                <th>Acción</th>
                <th>Responsable</th>
                <th>Estado</th>
                <th>Notas</th>
              </tr>
            </thead>

            <tbody>
              {analysis.responsibilities.map((item, index) => (
                <tr key={`${item.action}-${index}`}>
                  <td>{item.action}</td>
                  <td>
                    {item.responsible || "No determinado"}
                  </td>
                  <td>
                    {item.confidence === "identified"
                      ? "Identificado"
                      : "No determinado"}
                  </td>
                  <td>{item.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ContentSection>
      )}

      {analysis.prerequisites.length > 0 && (
        <ContentSection
          id="prerequisites"
          title="Requisitos previos"
          icon={<ClipboardCheck />}
        >
          <TextList values={analysis.prerequisites} />
        </ContentSection>
      )}

      {analysis.triggers.length > 0 && (
        <ContentSection
          id="triggers"
          title="Cuándo se aplica"
          icon={<PlayCircle />}
        >
          <TextList values={analysis.triggers} />
        </ContentSection>
      )}

      {analysis.procedures.length > 0 && (
        <ContentSection
          id="procedures"
          title="Procedimiento"
          description="Secuencia operativa extraída de la documentación."
          icon={<ListChecks />}
        >
          {analysis.procedures.map((procedure, index) => (
            <div key={`${procedure.name}-${index}`}>
              <h3>{procedure.name}</h3>

              {procedure.goal && (
                <p>{procedure.goal}</p>
              )}

              <ol>
                {procedure.steps.map((step, stepIndex) => (
                  <li key={`${step.order}-${stepIndex}`}>
                    <h4>{step.title}</h4>

                    {step.instruction && (
                      <p>{step.instruction}</p>
                    )}

                    {step.expectedResult && (
                      <p>
                        Resultado esperado:{" "}
                        {step.expectedResult}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </ContentSection>
      )}

      {analysis.businessRules.length > 0 && (
        <ContentSection
          id="business-rules"
          title="Reglas de negocio"
          icon={<ScrollText />}
        >
          <TextList values={analysis.businessRules} />
        </ContentSection>
      )}

      {analysis.warnings.length > 0 && (
        <ContentSection
          id="warnings"
          title="Advertencias"
          icon={<ShieldAlert />}
        >
          <TextList values={analysis.warnings} />
        </ContentSection>
      )}

      {analysis.checklists.length > 0 && (
        <ContentSection
          id="checklists"
          title="Listas de comprobación"
          icon={<CheckCircle2 />}
        >
          {analysis.checklists.map((checklist, index) => (
            <div key={`${checklist.title}-${index}`}>
              <h3>{checklist.title}</h3>
              <TextList values={checklist.items} />
            </div>
          ))}
        </ContentSection>
      )}

      {analysis.catalogTables.length > 0 && (
        <ContentSection
          id="catalog-tables"
          title="Tablas y catálogos"
          icon={<Table2 />}
        >
          {analysis.catalogTables.map((table, index) => {
            if (
              table.columns.length === 0 ||
              table.rows.length === 0
            ) {
              return null;
            }

            return (
              <div key={`${table.title}-${index}`}>
                <h3>{table.title || "Tabla"}</h3>

                {table.description && (
                  <p>{table.description}</p>
                )}

                {table.sourceDocumentName && (
                  <p>
                    Fuente: {table.sourceDocumentName}
                  </p>
                )}

                <table>
                  <thead>
                    <tr>
                      {table.columns.map((column, columnIndex) => (
                        <th key={`${column}-${columnIndex}`}>
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {table.rows.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {table.columns.map((column, columnIndex) => (
                          <td key={`${column}-${columnIndex}`}>
                            {row[columnIndex] ?? ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </ContentSection>
      )}

      {analysis.outputs.length > 0 && (
        <ContentSection
          id="outputs"
          title="Resultados"
          icon={<Box />}
        >
          <TextList values={analysis.outputs} />
        </ContentSection>
      )}

      {analysis.glossary.length > 0 && (
        <ContentSection
          id="glossary"
          title="Glosario"
          icon={<BookOpen />}
        >
          <dl>
            {analysis.glossary.map((item, index) => (
              <div key={`${item.term}-${index}`}>
                <dt>{item.term}</dt>
                <dd>{item.definition}</dd>
              </div>
            ))}
          </dl>
        </ContentSection>
      )}

      {analysis.commonQuestions.length > 0 && (
        <ContentSection
          id="common-questions"
          title="Preguntas frecuentes"
          icon={<CircleHelp />}
        >
          <TextList values={analysis.commonQuestions} />
        </ContentSection>
      )}

      {analysis.commonErrors.length > 0 && (
        <ContentSection
          id="common-errors"
          title="Errores frecuentes"
          icon={<AlertTriangle />}
        >
          <TextList values={analysis.commonErrors} />
        </ContentSection>
      )}

      {rebuildError && (
        <p role="alert">{rebuildError}</p>
      )}
    </>
  );
}