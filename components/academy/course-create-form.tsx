"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  ChevronRight,
  FileText,
  GraduationCap,
  Save,
  Sparkles,
  Tag,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CourseImageField } from "@/components/academy/course-image-field";
import {
  CourseEvaluationForm,
  type CourseEvaluationState,
} from "@/components/academy/course-evaluation-form";

const initialEvaluation: CourseEvaluationState = {
  topicAssessmentEnabled: true,
  topicQuestions: 5,
  finalAssessmentEnabled: true,
  finalDifficulty: "moderate",
  finalMode: "test",
  finalQuestions: 20,
  passingScore: 70,
  hasTimeLimit: false,
  timeLimitMinutes: 30,
};

export function CourseCreateForm() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [level, setLevel] = useState("beginner");
  const [image, setImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [evaluation, setEvaluation] =
    useState<CourseEvaluationState>(initialEvaluation);

  const evaluationConfig = useMemo(
    () => ({
      topicAssessment: {
        enabled: evaluation.topicAssessmentEnabled,
        questionsPerTopic: evaluation.topicQuestions,
      },
      finalAssessment: {
        enabled: evaluation.finalAssessmentEnabled,
        difficulty: evaluation.finalDifficulty,
        mode: evaluation.finalMode,
        questions: evaluation.finalQuestions,
        passingScore: evaluation.passingScore,
        timeLimitMinutes:
          evaluation.finalAssessmentEnabled && evaluation.hasTimeLimit
            ? evaluation.timeLimitMinutes
            : null,
      },
    }),
    [evaluation],
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // La UI queda completa y lista para conectar con la Server Action.
    // No hacemos persistencia falsa ni subimos la imagen desde el cliente.
    console.info("Course draft", {
      title,
      description,
      category,
      level,
      image,
      evaluationConfig,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="pb-10">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Panel
            icon={BookOpen}
            title="Información del curso"
            description="Define cómo aparecerá el curso dentro de Academy."
          >
            <div className="grid gap-5">
              <Field label="Título" required>
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Ej. Power BI para reporting"
                  className="h-10"
                  required
                />
              </Field>

              <Field label="Descripción">
                <Textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Explica brevemente qué aprenderá el alumno..."
                  className="min-h-28 resize-none"
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Categoría">
                  <div className="relative">
                    <Tag className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={category}
                      onChange={(event) => setCategory(event.target.value)}
                      placeholder="Datos y analítica"
                      className="h-10 pl-9"
                    />
                  </div>
                </Field>

                <Field label="Nivel" required>
                  <div className="relative">
                    <GraduationCap className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <select
                      value={level}
                      onChange={(event) => setLevel(event.target.value)}
                      className="h-10 w-full appearance-none rounded-md border border-input bg-background pl-9 pr-9 text-sm text-foreground outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <option value="beginner">Básico</option>
                      <option value="intermediate">Intermedio</option>
                      <option value="advanced">Avanzado</option>
                    </select>
                    <ChevronRight className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-slate-400" />
                  </div>
                </Field>
              </div>
            </div>
          </Panel>

          <Panel
            icon={FileText}
            title="Evaluación"
            description="Configura las reglas que utilizará Academy para evaluar el aprendizaje."
          >
            <CourseEvaluationForm
              value={evaluation}
              onChange={setEvaluation}
            />
          </Panel>
        </div>

        <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div>
              <h2 className="text-sm font-semibold text-slate-950">
                Portada del curso
              </h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Utiliza una imagen clara y reconocible en el catálogo.
              </p>
            </div>

            <div className="mt-4">
              <CourseImageField
                value={image}
                previewUrl={previewUrl}
                onChange={(file, preview) => {
                  setImage(file);
                  setPreviewUrl(preview);
                }}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-[#D9E5FF] bg-[#F7FAFF] p-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[#0A58FF] shadow-sm ring-1 ring-[#D9E5FF]">
              <Sparkles className="h-4 w-4" />
            </div>
            <h3 className="mt-4 text-sm font-semibold text-slate-950">
              El contenido viene después
            </h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Primero creamos la ficha y las reglas del curso. En el siguiente
              paso construiremos temas, objetivos de aprendizaje y contenido
              asistido por IA.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
              Estado
            </p>
            <div className="mt-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-900">Borrador</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  No será visible para los alumnos.
                </p>
              </div>
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            </div>
          </div>
        </aside>
      </div>

      <div className="mt-6 flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
        <Button asChild variant="secondary">
          <Link href="/courses?view=admin">Cancelar</Link>
        </Button>
        <Button type="submit" className="gap-2">
          <Save className="h-4 w-4" />
          Guardar borrador
        </Button>
      </div>
    </form>
  );
}

function Panel({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof BookOpen;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="mb-6 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EDF3FF] text-[#0A58FF]">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-medium text-slate-700">
        {label}
        {required ? <span className="ml-1 text-[#0A58FF]">*</span> : null}
      </span>
      {children}
    </label>
  );
}
