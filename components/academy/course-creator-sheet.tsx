// components/academy/course-creator-sheet.tsx

"use client";

import { useEffect, useState, useTransition } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  GraduationCap,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import { toast } from "sonner";

import {
  createCourseDraftAction,
  generateCourseImageAction,
} from "@/app/actions/course";
import type { AcademyAdminCourse } from "@/lib/services/academy.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type TrainingType = "required" | "skills";
type CourseLevel = "beginner" | "intermediate" | "advanced";
type Difficulty = "low" | "medium" | "high";

export function CourseCreatorSheet({
  open,
  onOpenChange,
  onCourseCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCourseCreated: (course: AcademyAdminCourse) => void;
}) {
  const [title, setTitle] = useState("");
  const [objective, setObjective] = useState("");
  const [trainingType, setTrainingType] =
    useState<TrainingType>("skills");
  const [level, setLevel] =
    useState<CourseLevel>("beginner");
  const [difficulty, setDifficulty] =
    useState<Difficulty>("medium");

  const [thumbnailBlobUrl, setThumbnailBlobUrl] =
    useState<string | null>(null);

  const [thumbnailPreviewUrl, setThumbnailPreviewUrl] =
    useState<string | null>(null);

  const [isSaving, startSaving] = useTransition();
  const [isGeneratingImage, startGeneratingImage] =
    useTransition();

  useEffect(() => {
    if (!open) {
      setTitle("");
      setObjective("");
      setTrainingType("skills");
      setLevel("beginner");
      setDifficulty("medium");
      setThumbnailBlobUrl(null);
      setThumbnailPreviewUrl(null);
    }
  }, [open]);

  function generateImage() {
    if (!title.trim()) {
      toast.error("Escribe primero el título del curso.");
      return;
    }

    startGeneratingImage(async () => {
      const result = await generateCourseImageAction({
        title: title.trim(),
        objective: objective.trim(),
        trainingType,
        level,
        difficulty,
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      setThumbnailBlobUrl(result.blobUrl);
      setThumbnailPreviewUrl(result.previewUrl);

      toast.success("Portada generada.");
    });
  }

  function saveDraft() {
    if (!title.trim()) {
      toast.error("El título del curso es obligatorio.");
      return;
    }

    startSaving(async () => {
      const result = await createCourseDraftAction({
        title: title.trim(),
        objective: objective.trim(),
        trainingType,
        level,
        difficulty,
        thumbnailUrl: thumbnailBlobUrl,
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      /*
       * IMPORTANTE:
       * Actualizamos el estado de la tabla ANTES de cerrar el panel.
       * No hay reload y el curso aparece inmediatamente.
       */
      onCourseCreated(result.course);

      toast.success("Borrador creado.");
      onOpenChange(false);
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="!w-[33vw] !max-w-[33vw] min-w-[620px] gap-0 border-l border-slate-200 !bg-white p-0"
      >
        <SheetHeader className="shrink-0 border-b border-slate-200 bg-white px-7 py-5 pr-16">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <GraduationCap className="h-4 w-4 text-[#315BFF]" />
            <span>Academy</span>
            <span className="text-slate-300">/</span>
            <span>Crear curso</span>
          </div>

          <SheetTitle className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
            Crear nuevo curso
          </SheetTitle>

          <SheetDescription className="mt-1 text-sm text-slate-500">
            Define lo esencial. Academy preparará después el curso y su
            evaluación.
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col bg-white px-7 py-5">
          <div className="mb-5 flex items-center gap-3 rounded-xl border border-[#DCE4FF] bg-[#F4F6FF] px-4 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-[#315BFF] shadow-sm">
              <Sparkles className="h-4 w-4" />
            </div>

            <p className="text-xs leading-5 text-slate-600">
              La IA decidirá el temario, duración y tipo de evaluación según
              estas decisiones.
            </p>
          </div>

          <div className="grid flex-1 grid-cols-2 gap-6">
            <section className="space-y-4">
              <SectionTitle
                icon={BookOpen}
                title="Información básica"
              />

              <Field label="Título del curso">
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Ej. Procedimiento de puestas en marcha"
                  className="h-10 bg-white"
                />
              </Field>

              <Field label="Objetivo">
                <Textarea
                  value={objective}
                  onChange={(event) => setObjective(event.target.value)}
                  placeholder="¿Qué debe aprender o demostrar el usuario?"
                  className="min-h-[102px] resize-none bg-white"
                />
              </Field>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-700">
                    Portada
                  </span>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-[#315BFF] hover:bg-[#EEF2FF] hover:text-[#315BFF]"
                    disabled={isGeneratingImage}
                    onClick={generateImage}
                  >
                    <Sparkles className="h-3.5 w-3.5" />

                    {isGeneratingImage
                      ? "Generando..."
                      : thumbnailPreviewUrl
                        ? "Regenerar"
                        : "Generar con IA"}
                  </Button>
                </div>

                <div className="flex h-[120px] items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                  {thumbnailPreviewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumbnailPreviewUrl}
                      alt="Portada generada"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="text-center">
                      <Sparkles className="mx-auto h-5 w-5 text-slate-300" />

                      <p className="mt-2 text-xs text-slate-400">
                        Genera una portada para el curso
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="space-y-5">
              <div>
                <SectionTitle
                  icon={GraduationCap}
                  title="Tipo de formación"
                />

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <ChoiceCard
                    selected={trainingType === "required"}
                    onClick={() => setTrainingType("required")}
                    icon={ShieldCheck}
                    title="Obligatoria"
                    description="Conocimiento que debe acreditarse."
                  />

                  <ChoiceCard
                    selected={trainingType === "skills"}
                    onClick={() => setTrainingType("skills")}
                    icon={Target}
                    title="Competencias"
                    description="Desarrollo profesional."
                  />
                </div>
              </div>

              <ChoiceGroup
                title="Nivel del curso"
                value={level}
                options={[
                  {
                    value: "beginner",
                    label: "Básico",
                    description: "Fundamentos",
                  },
                  {
                    value: "intermediate",
                    label: "Intermedio",
                    description: "Aplicación",
                  },
                  {
                    value: "advanced",
                    label: "Avanzado",
                    description: "Dominio",
                  },
                ]}
                onChange={(value) =>
                  setLevel(value as CourseLevel)
                }
              />

              <ChoiceGroup
                title="Dificultad"
                value={difficulty}
                options={[
                  {
                    value: "low",
                    label: "Baja",
                    description: "Validación sencilla",
                  },
                  {
                    value: "medium",
                    label: "Media",
                    description: "Exigencia estándar",
                  },
                  {
                    value: "high",
                    label: "Alta",
                    description: "Validación exigente",
                  },
                ]}
                onChange={(value) =>
                  setDifficulty(value as Difficulty)
                }
              />
            </section>
          </div>
        </div>

        <SheetFooter className="shrink-0 flex-row items-center justify-between border-t border-slate-200 bg-white px-7 py-4">
          <SheetClose asChild>
            <Button variant="outline" size="lg">
              Cancelar
            </Button>
          </SheetClose>

          <Button
            type="button"
            size="lg"
            disabled={isSaving || isGeneratingImage}
            onClick={saveDraft}
            className="gap-2 bg-[#315BFF] px-5 text-white hover:bg-[#244BE8]"
          >
            <Sparkles className="h-4 w-4" />

            {isSaving ? "Creando..." : "Crear borrador"}

            {!isSaving ? (
              <ArrowRight className="h-4 w-4" />
            ) : null}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function SectionTitle({
  icon: Icon,
  title,
}: {
  icon: typeof BookOpen;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-[#315BFF]" />
      <h3 className="text-sm font-semibold text-slate-900">
        {title}
      </h3>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-medium text-slate-700">
        {label}
      </span>
      {children}
    </label>
  );
}

function ChoiceCard({
  selected,
  onClick,
  icon: Icon,
  title,
  description,
}: {
  selected: boolean;
  onClick: () => void;
  icon: typeof BookOpen;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative min-h-[92px] rounded-xl border p-3 text-left transition",
        selected
          ? "border-[#315BFF] bg-[#F4F6FF] ring-1 ring-[#315BFF]/10"
          : "border-slate-200 bg-white hover:border-slate-300",
      )}
    >
      <div
        className={cn(
          "mb-2 flex h-7 w-7 items-center justify-center rounded-lg",
          selected
            ? "bg-[#E8EDFF] text-[#315BFF]"
            : "bg-slate-100 text-slate-500",
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </div>

      <p className="text-xs font-semibold text-slate-900">
        {title}
      </p>

      <p className="mt-0.5 text-[10px] leading-4 text-slate-500">
        {description}
      </p>

      {selected ? (
        <span className="absolute right-3 top-3 flex h-4 w-4 items-center justify-center rounded-full bg-[#315BFF] text-white">
          <Check className="h-2.5 w-2.5" />
        </span>
      ) : null}
    </button>
  );
}

function ChoiceGroup({
  title,
  value,
  options,
  onChange,
}: {
  title: string;
  value: string;
  options: Array<{
    value: string;
    label: string;
    description: string;
  }>;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-slate-700">
        {title}
      </p>

      <div className="grid grid-cols-3 gap-2">
        {options.map((option) => {
          const selected = option.value === value;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={cn(
                "rounded-xl border px-2 py-3 text-center transition",
                selected
                  ? "border-[#315BFF] bg-[#F4F6FF]"
                  : "border-slate-200 bg-white hover:border-slate-300",
              )}
            >
              <span
                className={cn(
                  "block text-xs font-semibold",
                  selected
                    ? "text-[#315BFF]"
                    : "text-slate-800",
                )}
              >
                {option.label}
              </span>

              <span className="mt-1 block text-[10px] text-slate-500">
                {option.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}