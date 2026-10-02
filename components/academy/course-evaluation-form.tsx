"use client";

import { Clock3, FileCheck2, ListChecks } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type AssessmentMode = "test" | "written" | "oral" | "combined";
export type AssessmentDifficulty = "light" | "moderate" | "hard";

export type CourseEvaluationState = {
  topicAssessmentEnabled: boolean;
  topicQuestions: number;
  finalAssessmentEnabled: boolean;
  finalDifficulty: AssessmentDifficulty;
  finalMode: AssessmentMode;
  finalQuestions: number;
  passingScore: number;
  hasTimeLimit: boolean;
  timeLimitMinutes: number;
};

type CourseEvaluationFormProps = {
  value: CourseEvaluationState;
  onChange: (next: CourseEvaluationState) => void;
};

const difficulties: Array<{
  value: AssessmentDifficulty;
  label: string;
  description: string;
}> = [
  { value: "light", label: "Leve", description: "Comprensión esencial" },
  { value: "moderate", label: "Moderada", description: "Aplicación y criterio" },
  { value: "hard", label: "Difícil", description: "Dominio profundo" },
];

const modes: Array<{ value: AssessmentMode; label: string }> = [
  { value: "test", label: "Tipo test" },
  { value: "written", label: "Escrita" },
  { value: "oral", label: "Oral" },
  { value: "combined", label: "Combinada" },
];

export function CourseEvaluationForm({
  value,
  onChange,
}: CourseEvaluationFormProps) {
  function patch(patchValue: Partial<CourseEvaluationState>) {
    onChange({ ...value, ...patchValue });
  }

  return (
    <div className="space-y-7">
      <section>
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EDF3FF] text-[#0A58FF]">
              <ListChecks className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-950">
                Comprobación por tema
              </h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Genera un pequeño test al terminar cada bloque del curso.
              </p>
            </div>
          </div>

          <Toggle
            checked={value.topicAssessmentEnabled}
            onChange={(checked) => patch({ topicAssessmentEnabled: checked })}
            label="Activar test por tema"
          />
        </div>

        {value.topicAssessmentEnabled ? (
          <div className="mt-4 rounded-xl bg-slate-50 p-4">
            <label className="block text-xs font-medium text-slate-700">
              Preguntas por tema
            </label>
            <Input
              type="number"
              min={1}
              max={20}
              value={value.topicQuestions}
              onChange={(event) =>
                patch({
                  topicQuestions: Math.max(1, Number(event.target.value) || 1),
                })
              }
              className="mt-2 h-9 max-w-32 bg-white"
            />
          </div>
        ) : null}
      </section>

      <div className="border-t border-slate-200" />

      <section>
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EDF3FF] text-[#0A58FF]">
              <FileCheck2 className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-950">
                Evaluación final
              </h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Define cómo se comprobará que el alumno ha superado el curso.
              </p>
            </div>
          </div>

          <Toggle
            checked={value.finalAssessmentEnabled}
            onChange={(checked) => patch({ finalAssessmentEnabled: checked })}
            label="Activar evaluación final"
          />
        </div>

        {value.finalAssessmentEnabled ? (
          <div className="mt-5 space-y-5">
            <div>
              <p className="text-xs font-medium text-slate-700">Dificultad</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {difficulties.map((difficulty) => (
                  <button
                    key={difficulty.value}
                    type="button"
                    onClick={() =>
                      patch({ finalDifficulty: difficulty.value })
                    }
                    className={cn(
                      "rounded-xl border p-3 text-left transition",
                      value.finalDifficulty === difficulty.value
                        ? "border-[#0A58FF] bg-[#F4F7FF] ring-1 ring-[#0A58FF]/10"
                        : "border-slate-200 bg-white hover:border-slate-300",
                    )}
                  >
                    <span className="block text-sm font-semibold text-slate-900">
                      {difficulty.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {difficulty.description}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-slate-700">
                Tipo de evaluación
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {modes.map((mode) => (
                  <button
                    key={mode.value}
                    type="button"
                    onClick={() => patch({ finalMode: mode.value })}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-xs font-medium transition",
                      value.finalMode === mode.value
                        ? "border-[#0A58FF] bg-[#EDF3FF] text-[#0A58FF]"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                    )}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
              {value.finalMode !== "test" ? (
                <p className="mt-2 text-xs text-amber-600">
                  Esta modalidad se guardará en la configuración, pero su
                  corrección se implementará en una fase posterior.
                </p>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField
                label="Número de preguntas"
                value={value.finalQuestions}
                min={1}
                max={100}
                onChange={(number) => patch({ finalQuestions: number })}
              />
              <NumberField
                label="Nota mínima (%)"
                value={value.passingScore}
                min={1}
                max={100}
                onChange={(number) => patch({ passingScore: number })}
              />
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Clock3 className="h-4 w-4 text-slate-400" />
                  <div>
                    <p className="text-xs font-medium text-slate-700">
                      Límite de tiempo
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      El tiempo comienza al iniciar la evaluación.
                    </p>
                  </div>
                </div>
                <Toggle
                  checked={value.hasTimeLimit}
                  onChange={(checked) => patch({ hasTimeLimit: checked })}
                  label="Activar límite de tiempo"
                />
              </div>

              {value.hasTimeLimit ? (
                <div className="mt-4 max-w-40">
                  <NumberField
                    label="Minutos"
                    value={value.timeLimitMinutes}
                    min={5}
                    max={240}
                    onChange={(number) =>
                      patch({ timeLimitMinutes: number })
                    }
                  />
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-700">{label}</span>
      <Input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          onChange(Math.min(max, Math.max(min, next || min)));
        }}
        className="mt-2 h-9 bg-white"
      />
    </label>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors",
        checked ? "bg-[#0A58FF]" : "bg-slate-300",
      )}
    >
      <span
        className={cn(
          "absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-1" : "-translate-x-4",
        )}
      />
    </button>
  );
}
