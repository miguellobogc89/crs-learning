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
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { CreateCourseHeader } from "@/components/academy/create-course/create-course-header";

import {
  createCourseDraftAction,
  generateCourseImageAction,
} from "@/app/actions/course";
import type { AcademyAdminCourse } from "@/lib/services/academy.service";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
} from "@/components/ui/sheet";
import { CourseBasicInformation } from "@/components/academy/create-course/course-basic-information";
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

      onCourseCreated(result.course);
      toast.success("Borrador creado.");
      onOpenChange(false);
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="!w-[46vw] !max-w-[760px] min-w-[680px] gap-0 border-l border-slate-200 !bg-white p-0 shadow-2xl"
      >
        <CreateCourseHeader />

        <div className="min-h-0 flex-1 overflow-y-auto bg-white">
          <div className="divide-y divide-slate-200 px-8">


<CourseBasicInformation
  title={title}
  description={objective}
  imageUrl={thumbnailPreviewUrl}
  isGeneratingImage={isGeneratingImage}
  onTitleChange={setTitle}
  onDescriptionChange={setObjective}
  onGenerateImage={generateImage}
/>

            {/* CONFIGURACIÓN */}
            <section className="py-6">
              <SectionHeader
                icon={GraduationCap}
                title="Configuración general"
              />

              <div className="mt-4 grid grid-cols-3 gap-4">
                <div>
                  <ConfigLabel>Tipo de formación</ConfigLabel>

                  <div className="space-y-2">
                    <OptionCard
                      selected={trainingType === "required"}
                      onClick={() =>
                        setTrainingType("required")
                      }
                      icon={ShieldCheck}
                      label="Obligatoria"
                      description="Conocimiento que debe acreditarse."
                    />

                    <OptionCard
                      selected={trainingType === "skills"}
                      onClick={() => setTrainingType("skills")}
                      icon={Target}
                      label="Competencias"
                      description="Desarrollo profesional."
                    />
                  </div>
                </div>

                <div>
                  <ConfigLabel>Nivel del curso</ConfigLabel>

                  <div className="space-y-2">
                    <CompactOption
                      selected={level === "beginner"}
                      onClick={() => setLevel("beginner")}
                      iconLevel={1}
                      label="Básico"
                    />

                    <CompactOption
                      selected={level === "intermediate"}
                      onClick={() => setLevel("intermediate")}
                      iconLevel={2}
                      label="Intermedio"
                    />

                    <CompactOption
                      selected={level === "advanced"}
                      onClick={() => setLevel("advanced")}
                      iconLevel={3}
                      label="Avanzado"
                    />
                  </div>
                </div>

                <div>
                  <ConfigLabel>Dificultad general</ConfigLabel>

                  <div className="space-y-2">
                    <CompactOption
                      selected={difficulty === "low"}
                      onClick={() => setDifficulty("low")}
                      iconLevel={1}
                      label="Baja"
                    />

                    <CompactOption
                      selected={difficulty === "medium"}
                      onClick={() => setDifficulty("medium")}
                      iconLevel={2}
                      label="Media"
                    />

                    <CompactOption
                      selected={difficulty === "high"}
                      onClick={() => setDifficulty("high")}
                      iconLevel={3}
                      label="Alta"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* ASIGNACIÓN */}
            <section className="py-6">
              <SectionHeader
                icon={Users}
                title="Asignación"
                optional
                description="Podrás asignar el curso a personas o equipos después de crearlo."
              />

              <div className="mt-4 flex items-center gap-3 rounded-xl border border-[#DCE4FF] bg-[#F8F9FF] px-4 py-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E9EEFF] text-[#315BFF]">
                  <Check className="h-4 w-4" />
                </div>

                <div>
                  <p className="text-xs font-medium text-slate-900">
                    Sin asignar por ahora
                  </p>

                  <p className="mt-0.5 text-[11px] text-slate-500">
                    El curso se creará como borrador y podrás gestionar
                    destinatarios desde su panel.
                  </p>
                </div>
              </div>
            </section>
          </div>
        </div>

        <SheetFooter className="shrink-0 flex-row items-center justify-between border-t border-slate-200 bg-white px-8 py-4">
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
            {isSaving ? "Creando..." : "Crear curso"}

            {!isSaving ? (
              <ArrowRight className="h-4 w-4" />
            ) : null}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  description,
  optional = false,
}: {
  icon: typeof BookOpen;
  title: string;
  description?: string;
  optional?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center text-[#315BFF]">
        <Icon className="h-[18px] w-[18px]" />
      </div>

      <div>
        <div className="flex items-center gap-1">
          <h3 className="text-sm font-semibold text-slate-950">
            {title}
          </h3>

          {optional ? (
            <span className="text-xs font-normal text-slate-400">
              (opcional)
            </span>
          ) : null}
        </div>

        {description ? (
          <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Field({
  label,
  counter,
  children,
}: {
  label: string;
  counter?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-medium text-slate-700">
        {label}
      </span>

      {children}

      {counter ? (
        <span className="mt-1 block text-right text-[10px] text-slate-400">
          {counter}
        </span>
      ) : null}
    </label>
  );
}

function ConfigLabel({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <p className="mb-2 text-[11px] font-medium text-slate-700">
      {children}
    </p>
  );
}

function OptionCard({
  selected,
  onClick,
  icon: Icon,
  label,
  description,
}: {
  selected: boolean;
  onClick: () => void;
  icon: typeof ShieldCheck;
  label: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex min-h-[62px] w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition",
        selected
          ? "border-[#315BFF] bg-[#F7F8FF] shadow-[0_0_0_1px_rgba(49,91,255,0.05)]"
          : "border-slate-200 bg-white hover:border-slate-300",
      )}
    >
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center",
          selected ? "text-[#315BFF]" : "text-slate-400",
        )}
      >
        <Icon className="h-4 w-4" />
      </div>

      <div className="min-w-0 pr-3">
        <p
          className={cn(
            "text-[11px] font-semibold",
            selected ? "text-slate-950" : "text-slate-700",
          )}
        >
          {label}
        </p>

        <p className="mt-0.5 text-[9px] leading-3 text-slate-400">
          {description}
        </p>
      </div>

      <span
        className={cn(
          "absolute right-2.5 top-2.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border",
          selected
            ? "border-[#315BFF] bg-[#315BFF] text-white"
            : "border-slate-300 bg-white",
        )}
      >
        {selected ? <Check className="h-2 w-2" /> : null}
      </span>
    </button>
  );
}

function CompactOption({
  selected,
  onClick,
  label,
  iconLevel,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  iconLevel: 1 | 2 | 3;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-[42px] w-full items-center justify-center gap-2 rounded-lg border px-2 transition",
        selected
          ? "border-[#315BFF] bg-[#F7F8FF] text-[#315BFF]"
          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300",
      )}
    >
      <LevelBars level={iconLevel} active={selected} />

      <span className="text-[11px] font-medium">
        {label}
      </span>
    </button>
  );
}

function LevelBars({
  level,
  active,
}: {
  level: 1 | 2 | 3;
  active: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-4 items-end gap-[2px]",
        active ? "text-[#315BFF]" : "text-slate-400",
      )}
    >
      {[1, 2, 3].map((bar) => (
        <span
          key={bar}
          className={cn(
            "w-[3px] rounded-[1px]",
            bar === 1
              ? "h-1.5"
              : bar === 2
                ? "h-2.5"
                : "h-3.5",
            bar <= level
              ? "bg-current"
              : "bg-slate-200",
          )}
        />
      ))}
    </div>
  );
}