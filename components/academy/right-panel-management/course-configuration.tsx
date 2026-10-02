// // components/academy/right-panel-management/course-configuration.tsx

"use client";

import {
  BarChart3,
  Clock3,
  GraduationCap,
  Info,
  ShieldCheck,
  SlidersHorizontal,
  Target,
} from "lucide-react";

import { Select } from "@/components/ui/select";

type TrainingType = "required" | "skills";
type CourseLevel = "beginner" | "intermediate" | "advanced";
type Difficulty = "low" | "medium" | "high";

type CourseConfigurationProps = {
  trainingType: TrainingType;
  level: CourseLevel;
  difficulty: Difficulty;
  onTrainingTypeChange: (value: TrainingType) => void;
  onLevelChange: (value: CourseLevel) => void;
  onDifficultyChange: (value: Difficulty) => void;
};

export function CourseConfiguration({
  trainingType,
  level,
  difficulty,
  onTrainingTypeChange,
  onLevelChange,
  onDifficultyChange,
}: CourseConfigurationProps) {
  return (
    <section className="border-b border-[#EEF1F6] px-5 py-5">
      <div className="flex items-start gap-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center text-[#315BFF]">
          <SlidersHorizontal
            className="h-[18px] w-[18px]"
            strokeWidth={2}
          />
        </div>

        <div>
          <h3 className="text-[14px] font-bold leading-5 tracking-[-0.025em] text-[#071747]">
            Configuración del curso
          </h3>

          <p className="mt-0.5 text-[11.5px] leading-4 tracking-[-0.015em] text-[#536184]">
            Define los parámetros que se usarán para generar la
            estructura y las evaluaciones.
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4">
        <ConfigurationField
          label="Tipo de formación"
          description={
            trainingType === "required"
              ? "Debe ser completado y acreditado."
              : "Orientado al desarrollo profesional."
          }
        >
          <div className="relative">
            {trainingType === "required" ? (
              <ShieldCheck className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-[#315BFF]" />
            ) : (
              <Target className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-[#315BFF]" />
            )}

            <Select
              value={trainingType}
              onChange={(event) =>
                onTrainingTypeChange(
                  event.target.value as TrainingType,
                )
              }
              className="h-10 appearance-none border-[#DDE3F0] bg-white pl-9 pr-9 text-[12px] font-medium text-[#1B2851] shadow-none focus-visible:border-[#315BFF] focus-visible:ring-[#315BFF]/15"
            >
              <option value="required">
                Formación obligatoria
              </option>

              <option value="skills">
                Desarrollo de competencias
              </option>
            </Select>

            <SelectChevron />
          </div>
        </ConfigurationField>

        <ConfigurationField
          label="Nivel del curso"
          description={
            level === "beginner"
              ? "Contenidos introductorios y conceptos fundamentales."
              : level === "intermediate"
                ? "Requiere conocimientos previos del tema."
                : "Profundización y dominio avanzado."
          }
        >
          <div className="relative">
            <GraduationCap className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-[#315BFF]" />

            <Select
              value={level}
              onChange={(event) =>
                onLevelChange(
                  event.target.value as CourseLevel,
                )
              }
              className="h-10 appearance-none border-[#DDE3F0] bg-white pl-9 pr-9 text-[12px] font-medium text-[#1B2851] shadow-none focus-visible:border-[#315BFF] focus-visible:ring-[#315BFF]/15"
            >
              <option value="beginner">Básico</option>
              <option value="intermediate">
                Intermedio
              </option>
              <option value="advanced">Avanzado</option>
            </Select>

            <SelectChevron />
          </div>
        </ConfigurationField>

        <ConfigurationField
          label="Dificultad de la evaluación"
          description={
            difficulty === "low"
              ? "Evaluación sencilla centrada en conceptos esenciales."
              : difficulty === "medium"
                ? "Equilibrio entre comprensión y profundidad."
                : "Mayor exigencia, profundidad y aplicación práctica."
          }
        >
          <div className="relative">
            <BarChart3 className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-[#315BFF]" />

            <Select
              value={difficulty}
              onChange={(event) =>
                onDifficultyChange(
                  event.target.value as Difficulty,
                )
              }
              className="h-10 appearance-none border-[#DDE3F0] bg-white pl-9 pr-9 text-[12px] font-medium text-[#1B2851] shadow-none focus-visible:border-[#315BFF] focus-visible:ring-[#315BFF]/15"
            >
              <option value="low">Baja</option>
              <option value="medium">Media</option>
              <option value="high">Alta</option>
            </Select>

            <SelectChevron />
          </div>
        </ConfigurationField>

        <ConfigurationField
          label="Duración estimada"
          description="Se calculará según el contenido, el nivel y la estructura generada."
        >
          <div className="flex h-10 items-center rounded-lg border border-[#DDE3F0] bg-[#FAFBFD] px-3">
            <Clock3 className="h-4 w-4 shrink-0 text-[#315BFF]" />

            <span className="ml-2.5 text-[12px] font-medium text-[#1B2851]">
              Automática
            </span>

            <span className="ml-auto rounded-md bg-[#EDF2FF] px-2 py-0.5 text-[9px] font-semibold text-[#315BFF]">
              Recomendada
            </span>
          </div>
        </ConfigurationField>
      </div>

      <div className="mt-4 flex items-center gap-2.5 rounded-lg border border-[#DCE4FF] bg-[#F7F9FF] px-3 py-2">
        <Info className="h-3.5 w-3.5 shrink-0 text-[#315BFF]" />

        <p className="text-[10.5px] leading-4 text-[#536184]">
          Estos parámetros se usarán para generar la estructura y las
          evaluaciones. Podrás modificarlos después.
        </p>
      </div>
    </section>
  );
}

function ConfigurationField({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-[11px] font-semibold text-[#071747]">
        {label}
      </p>

      {children}

      <p className="mt-1.5 min-h-4 text-[10px] leading-4 text-[#7180A0]">
        {description}
      </p>
    </div>
  );
}

function SelectChevron() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#7180A0]"
    >
      <path
        d="M5 7.5L10 12.5L15 7.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}