// components/academy/course-management-sheet.tsx

"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  BookOpen,
  Check,
  GraduationCap,
  Search,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import {
  assignCourseAction,
  generateCourseImageAction,
  getCourseManagementDataAction,
  updateCourseAction,
} from "@/app/actions/course";
import type {
  AcademyAdminCourse,
  AcademyCourseAssignmentOption,
} from "@/lib/services/academy.service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type TrainingType = "required" | "skills";
type CourseLevel = "beginner" | "intermediate" | "advanced";
type Difficulty = "low" | "medium" | "high";

type Props = {
  course: AcademyAdminCourse | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCourseUpdated: (course: AcademyAdminCourse) => void;
};

const TYPE_OPTIONS: Array<{
  value: TrainingType;
  label: string;
}> = [
  { value: "required", label: "Formación obligatoria" },
  { value: "skills", label: "Desarrollo de competencias" },
];

const LEVEL_OPTIONS: Array<{
  value: CourseLevel;
  label: string;
}> = [
  { value: "beginner", label: "Básico" },
  { value: "intermediate", label: "Intermedio" },
  { value: "advanced", label: "Avanzado" },
];

const DIFFICULTY_OPTIONS: Array<{
  value: Difficulty;
  label: string;
}> = [
  { value: "low", label: "Baja" },
  { value: "medium", label: "Media" },
  { value: "high", label: "Alta" },
];

export function CourseManagementSheet({
  course,
  open,
  onOpenChange,
  onCourseUpdated,
}: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [trainingType, setTrainingType] =
    useState<TrainingType>("skills");
  const [level, setLevel] = useState<CourseLevel>("beginner");
  const [difficulty, setDifficulty] =
    useState<Difficulty>("medium");

  const [thumbnailBlobUrl, setThumbnailBlobUrl] =
    useState<string | null>(null);
  const [thumbnailPreviewUrl, setThumbnailPreviewUrl] =
    useState<string | null>(null);

  const [assignmentOptions, setAssignmentOptions] = useState<
    AcademyCourseAssignmentOption[]
  >([]);

  const [assignmentSearch, setAssignmentSearch] = useState("");
  const [assignmentMode, setAssignmentMode] =
    useState<"users" | "teams">("users");

  const [isSaving, startSaving] = useTransition();
  const [isGeneratingImage, startGeneratingImage] =
    useTransition();
  const [isLoadingAssignments, startLoadingAssignments] =
    useTransition();
  const [isAssigning, startAssigning] = useTransition();

  useEffect(() => {
    if (!course || !open) {
      return;
    }

    setTitle(course.title);
    setDescription(course.description);
    setTrainingType(course.type);
    setLevel(course.level);
    setDifficulty(course.difficulty);
    setThumbnailBlobUrl(null);
    setThumbnailPreviewUrl(course.thumbnailUrl);
    setAssignmentSearch("");
    setAssignmentMode("users");

    startLoadingAssignments(async () => {
      const result = await getCourseManagementDataAction(course.id);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      setAssignmentOptions(result.options);
    });
  }, [course, open]);

  const visibleAssignmentOptions = useMemo(() => {
    const query = assignmentSearch.trim().toLowerCase();

    return assignmentOptions.filter((option) => {
      if (option.kind !== assignmentMode.slice(0, -1)) {
        return false;
      }

      if (!query) {
        return true;
      }

      return (
        option.name.toLowerCase().includes(query) ||
        option.secondary.toLowerCase().includes(query)
      );
    });
  }, [assignmentOptions, assignmentMode, assignmentSearch]);

  if (!course) {
    return null;
  }

  function saveCourse() {
    if (!course || !title.trim()) {
      toast.error("El título del curso es obligatorio.");
      return;
    }

    startSaving(async () => {
      const result = await updateCourseAction({
        courseId: course.id,
        title: title.trim(),
        description: description.trim(),
        trainingType,
        level,
        difficulty,
        thumbnailUrl: thumbnailBlobUrl,
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      onCourseUpdated(result.course);
      setThumbnailBlobUrl(null);
      setThumbnailPreviewUrl(result.course.thumbnailUrl);

      toast.success("Curso actualizado.");
    });
  }

  function generateImage() {
    if (!title.trim()) {
      toast.error("Escribe primero el título del curso.");
      return;
    }

    startGeneratingImage(async () => {
      const result = await generateCourseImageAction({
        title: title.trim(),
        objective: description.trim(),
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

      toast.success("Nueva portada generada.");
    });
  }

  function assign(option: AcademyCourseAssignmentOption) {
    if (!course || option.assigned) {
      return;
    }

    startAssigning(async () => {
      const result = await assignCourseAction({
        courseId: course.id,
        targetId: option.id,
        targetType: option.kind,
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      setAssignmentOptions((current) =>
        current.map((item) =>
          item.id === option.id && item.kind === option.kind
            ? { ...item, assigned: true }
            : item,
        ),
      );

      onCourseUpdated(result.course);

      toast.success(
        option.kind === "team"
          ? "Curso asignado al equipo."
          : "Curso asignado al usuario.",
      );
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
            <span>Gestión de cursos</span>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <SheetTitle className="text-xl font-semibold tracking-tight text-slate-950">
              Editar curso
            </SheetTitle>

            <Badge
              className={cn(
                "border-0 font-normal",
                course.status === "published"
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-slate-100 text-slate-600",
              )}
            >
              {course.status === "published"
                ? "Publicado"
                : "Borrador"}
            </Badge>
          </div>

          <SheetDescription className="mt-1 text-sm text-slate-500">
            Edita la información del curso y gestiona a quién está asignado.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto bg-white">
          <div className="space-y-7 px-7 py-6">
            <section className="space-y-4">
              <SectionTitle
                icon={BookOpen}
                title="Información del curso"
              />

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
                      : "Generar nueva"}
                  </Button>
                </div>

                <div className="aspect-[16/6] overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                  {thumbnailPreviewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumbnailPreviewUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-slate-300">
                      <BookOpen className="h-8 w-8" />
                    </div>
                  )}
                </div>
              </div>

              <Field label="Título">
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="h-10 bg-white"
                />
              </Field>

              <Field label="Descripción / objetivo">
                <Textarea
                  value={description}
                  onChange={(event) =>
                    setDescription(event.target.value)
                  }
                  className="min-h-[96px] resize-none bg-white"
                />
              </Field>

              <div className="grid grid-cols-3 gap-3">
                <ChoiceField
                  label="Tipo"
                  value={trainingType}
                  options={TYPE_OPTIONS}
                  onChange={(value) =>
                    setTrainingType(value as TrainingType)
                  }
                />

                <ChoiceField
                  label="Nivel"
                  value={level}
                  options={LEVEL_OPTIONS}
                  onChange={(value) =>
                    setLevel(value as CourseLevel)
                  }
                />

                <ChoiceField
                  label="Dificultad"
                  value={difficulty}
                  options={DIFFICULTY_OPTIONS}
                  onChange={(value) =>
                    setDifficulty(value as Difficulty)
                  }
                />
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={saveCourse}
                  disabled={isSaving}
                  className="bg-[#315BFF] text-white hover:bg-[#244BE8]"
                >
                  {isSaving ? "Guardando..." : "Guardar cambios"}
                </Button>
              </div>
            </section>

            <div className="border-t border-slate-200" />

            <section className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <SectionTitle
                  icon={Users}
                  title="Asignaciones"
                />

                <span className="text-xs text-slate-400">
                  {course.students} usuarios
                </span>
              </div>

              <p className="text-xs leading-5 text-slate-500">
                Asigna este curso directamente a personas o a todos los
                miembros de un equipo.
              </p>

              <div className="flex rounded-lg bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setAssignmentMode("users")}
                  className={cn(
                    "flex-1 rounded-md px-3 py-2 text-xs font-medium transition",
                    assignmentMode === "users"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500",
                  )}
                >
                  Usuarios
                </button>

                <button
                  type="button"
                  onClick={() => setAssignmentMode("teams")}
                  className={cn(
                    "flex-1 rounded-md px-3 py-2 text-xs font-medium transition",
                    assignmentMode === "teams"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500",
                  )}
                >
                  Equipos
                </button>
              </div>

              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                <Input
                  value={assignmentSearch}
                  onChange={(event) =>
                    setAssignmentSearch(event.target.value)
                  }
                  placeholder={
                    assignmentMode === "users"
                      ? "Buscar usuario..."
                      : "Buscar equipo..."
                  }
                  className="h-10 bg-slate-50 pl-9"
                />
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200">
                {isLoadingAssignments ? (
                  <div className="px-4 py-8 text-center text-xs text-slate-400">
                    Cargando...
                  </div>
                ) : visibleAssignmentOptions.length === 0 ? (
                  <div className="px-4 py-8 text-center text-xs text-slate-400">
                    No hay resultados.
                  </div>
                ) : (
                  visibleAssignmentOptions.map((option) => (
                    <div
                      key={`${option.kind}-${option.id}`}
                      className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EEF2FF] text-[#315BFF]">
                        {option.kind === "team" ? (
                          <Users className="h-4 w-4" />
                        ) : (
                          <span className="text-xs font-semibold">
                            {getInitials(option.name)}
                          </span>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-slate-900">
                          {option.name}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-slate-500">
                          {option.secondary}
                        </p>
                      </div>

                      <Button
                        type="button"
                        variant={option.assigned ? "ghost" : "outline"}
                        size="sm"
                        disabled={option.assigned || isAssigning}
                        onClick={() => assign(option)}
                        className={cn(
                          "gap-1.5",
                          option.assigned &&
                            "text-emerald-600 opacity-100",
                        )}
                      >
                        {option.assigned ? (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            Asignado
                          </>
                        ) : (
                          <>
                            <UserPlus className="h-3.5 w-3.5" />
                            Asignar
                          </>
                        )}
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
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
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#EEF2FF] text-[#315BFF]">
        <Icon className="h-4 w-4" />
      </div>
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

function ChoiceField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-medium text-slate-700">
        {label}
      </span>

      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-lg border border-input bg-white px-3 text-xs text-slate-700 outline-none focus:border-[#315BFF] focus:ring-2 focus:ring-[#315BFF]/10"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}