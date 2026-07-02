// components/knowledge/knowledge-summary.tsx
import {
  AlertTriangle,
  BookOpen,
  Brain,
  CalendarDays,
  CheckCircle2,
  ListOrdered,
  Target,
} from "lucide-react";

import { KnowledgeViewModel } from "@/lib/knowledge/knowledge-analysis.types";

type Props = {
  analysis: KnowledgeViewModel;
};

export function KnowledgeSummary({ analysis }: Props) {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
          <BookOpen className="h-5 w-5" />
          Resumen
        </h2>
        <p className="leading-7 text-muted-foreground">{analysis.summary}</p>
      </section>

      {analysis.objective && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <Target className="h-5 w-5" />
            Objetivo
          </h2>
          <p className="leading-7 text-muted-foreground">{analysis.objective}</p>
        </section>
      )}

      {analysis.scope && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Alcance</h2>
          <p className="leading-7 text-muted-foreground">{analysis.scope}</p>
        </section>
      )}

      {analysis.importantDates.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <CalendarDays className="h-5 w-5" />
            Fechas importantes
          </h2>

          <div className="space-y-2">
            {analysis.importantDates.map((date, index) => (
              <div key={index} className="rounded-lg border p-3 text-sm">
                <span className="font-medium">{date.label}: </span>
                <span className="text-muted-foreground">{date.value}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {analysis.systems.length > 0 && (
        <CardGrid
          title="Sistemas implicados"
          items={analysis.systems.map((system) => ({
            title: system.name,
            description: system.description,
          }))}
        />
      )}

      {analysis.actors.length > 0 && (
        <CardGrid
          title="Actores"
          items={analysis.actors.map((actor) => ({
            title: actor.name,
            description: actor.role,
          }))}
        />
      )}

      {analysis.topics.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <Brain className="h-5 w-5" />
            Temas principales
          </h2>

          <div className="flex flex-wrap gap-2">
            {analysis.topics.map((topic) => (
              <span key={topic} className="rounded-full border px-3 py-1 text-sm">
                {topic}
              </span>
            ))}
          </div>
        </section>
      )}

      {analysis.concepts.length > 0 && (
        <CardGrid
          title="Conceptos"
          items={analysis.concepts.map((concept) => ({
            title: concept.name,
            description: concept.definition,
          }))}
        />
      )}

      {analysis.prerequisites.length > 0 && (
        <StringList title="Requisitos previos" items={analysis.prerequisites} />
      )}

      {analysis.triggers.length > 0 && (
        <StringList title="Disparadores" items={analysis.triggers} />
      )}

      {analysis.businessRules.length > 0 && (
        <StringList title="Reglas de negocio" items={analysis.businessRules} />
      )}

      {analysis.warnings.length > 0 && (
        <StringList title="Advertencias" items={analysis.warnings} />
      )}

      {analysis.procedures.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <ListOrdered className="h-5 w-5" />
            Procedimientos
          </h2>

          <div className="space-y-5">
            {analysis.procedures.map((procedure, procedureIndex) => (
              <div key={procedureIndex} className="rounded-lg border p-4">
                <h3 className="font-medium">{procedure.name}</h3>

                {procedure.goal && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {procedure.goal}
                  </p>
                )}

                <ol className="mt-3 list-decimal space-y-3 pl-5">
                  {procedure.steps.map((step, stepIndex) => (
                    <li key={stepIndex}>
                      <p className="font-medium">{step.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {step.instruction}
                      </p>
                      {step.expectedResult && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Resultado esperado: {step.expectedResult}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </section>
      )}

      {analysis.outputs.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <CheckCircle2 className="h-5 w-5" />
            Resultados esperados
          </h2>
          <StringList title="" items={analysis.outputs} />
        </section>
      )}

      {analysis.commonErrors.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <AlertTriangle className="h-5 w-5" />
            Errores frecuentes
          </h2>
          <StringList title="" items={analysis.commonErrors} />
        </section>
      )}

      {analysis.commonQuestions.length > 0 && (
        <StringList title="Preguntas frecuentes" items={analysis.commonQuestions} />
      )}
    </div>
  );
}

function StringList({ title, items }: { title: string; items: string[] }) {
  return (
    <section>
      {title && <h2 className="mb-3 text-lg font-semibold">{title}</h2>}

      <ul className="space-y-2">
        {items.map((item, index) => (
          <li key={index}>• {item}</li>
        ))}
      </ul>
    </section>
  );
}

function CardGrid({
  title,
  items,
}: {
  title: string;
  items: { title: string; description: string }[];
}) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>

      <div className="grid gap-3 md:grid-cols-2">
        {items.map((item, index) => (
          <div key={index} className="rounded-lg border p-4">
            <h3 className="font-medium">{item.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {item.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}