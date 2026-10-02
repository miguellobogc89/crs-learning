// components/academy/course-management-sheet.tsx

"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  GraduationCap,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
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
  SheetFooter,
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
  const [level, setLevel] =
    useState<CourseLevel>("beginner");
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
  const [showAssignmentManager, setShowAssignmentManager] =
    useState(false);

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
    setShowAssignmentManager(false);

    startLoadingAssignments(async () => {
      const result =
        await getCourseManagementDataAction(course.id);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      setAssignmentOptions(result.options);
    });
  }, [course, open]);

  const visibleAssignmentOptions = useMemo(() => {
    const query = assignmentSearch.trim().toLowerCase();
    const kind = assignmentMode === "users" ? "user" : "team";

    return assignmentOptions.filter((option) => {
      if (option.kind !== kind) {
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
  }, [
    assignmentOptions,
    assignmentMode,
    assignmentSearch,
  ]);

  const assignedUsers = useMemo(
    () =>
      assignmentOptions.filter(
        (option) =>
          option.kind === "user" && option.assigned,
      ),
    [assignmentOptions],
  );

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

      if (option.kind === "team") {
        const refreshed =
          await getCourseManagementDataAction(course.id);

        if (refreshed.ok) {
          setAssignmentOptions(refreshed.options);
        }
      } else {
        setAssignmentOptions((current) =>
          current.map((item) =>
            item.id === option.id &&
            item.kind === option.kind
              ? { ...item, assigned: true }
              : item,
          ),
        );
      }

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
        className="!w-[46vw] !max-w-[760px] min-w-[680px] gap-0 border-l border-slate-200 !bg-white p-0 shadow-2xl"
      >
        <SheetHeader className="shrink-0 border-b border-slate-200 bg-white px-8 py-6 pr-16">
          <div className="flex items-center gap-2">
            <SheetTitle className="text-[22px] font-semibold tracking-[-0.025em] text-slate-950">
              Editar curso
            </SheetTitle>

            <Badge
              className={cn(
                "border-0 px-2 py-0.5 text-[10px] font-medium",
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

          <SheetDescription className="mt-1 text-[13px] text-slate-500">
            Modifica la información del curso y gestiona sus
            destinatarios.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto bg-white">
          <div className="divide-y divide-slate-200 px-8">
            {/* PORTADA */}
            <section className="py-6">
              <SectionHeader
                icon={Sparkles}
                title="Portada del curso"
              />

              <div className="group relative mt-4 aspect-[16/5.2] overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                {thumbnailPreviewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumbnailPreviewUrl}
                    alt="Portada del curso"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center text-slate-400">
                    <BookOpen className="h-7 w-7" />
                    <span className="mt-2 text-xs">
                      Sin portada
                    </span>
                  </div>
                )}

                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={generateImage}
                  disabled={isGeneratingImage}
                  className="absolute right-3 top-3 gap-2 border border-slate-200 bg-white/95 shadow-sm hover:bg-white"
                >
                  <Sparkles className="h-3.5 w-3.5 text-[#315BFF]" />

                  {isGeneratingImage
                    ? "Generando..."
                    : "Cambiar imagen"}
                </Button>
              </div>
            </section>

            {/* INFORMACIÓN */}
            <section className="py-6">
              <SectionHeader
                icon={BookOpen}
                title="Información básica"
              />

              <div className="mt-4 space-y-4">
                <Field label="Título del curso">
                  <Input
                    value={title}
                    onChange={(event) =>
                      setTitle(event.target.value)
                    }
                    className="h-10 bg-white text-sm"
                  />
                </Field>

                <Field
                  label="Descripción"
                  counter={`${description.length}/500`}
                >
                  <Textarea
                    value={description}
                    maxLength={500}
                    onChange={(event) =>
                      setDescription(event.target.value)
                    }
                    className="min-h-[90px] resize-none bg-white text-sm"
                  />
                </Field>
              </div>
            </section>

            {/* CONFIGURACIÓN */}
            <section className="py-6">
              <SectionHeader
                icon={GraduationCap}
                title="Configuración"
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
              <div className="flex items-start justify-between gap-4">
                <SectionHeader
                  icon={Users}
                  title="Asignación"
                />

                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-slate-500">
                    {course.students}{" "}
                    {course.students === 1
                      ? "usuario asignado"
                      : "usuarios asignados"}
                  </span>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setShowAssignmentManager(
                        (current) => !current,
                      )
                    }
                    className="h-8 px-3 text-xs"
                  >
                    {showAssignmentManager
                      ? "Cerrar"
                      : "Gestionar"}
                  </Button>
                </div>
              </div>

              {!showAssignmentManager ? (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {assignedUsers.length === 0 ? (
                    <p className="text-xs text-slate-400">
                      Este curso todavía no tiene usuarios
                      asignados.
                    </p>
                  ) : (
                    <>
                      {assignedUsers
                        .slice(0, 3)
                        .map((user) => (
                          <div
                            key={user.id}
                            className="flex h-9 items-center gap-2 rounded-full bg-slate-50 px-2.5 pr-3"
                          >
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#E8EDFF] text-[9px] font-semibold text-[#315BFF]">
                              {getInitials(user.name)}
                            </div>

                            <span className="max-w-[110px] truncate text-[10px] font-medium text-slate-700">
                              {user.name}
                            </span>
                          </div>
                        ))}

                      {assignedUsers.length > 3 ? (
                        <div className="flex h-9 min-w-9 items-center justify-center rounded-full border border-[#DCE4FF] bg-[#F7F8FF] px-2 text-[10px] font-semibold text-[#315BFF]">
                          +{assignedUsers.length - 3}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              ) : (
                <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <div className="border-b border-slate-200 bg-slate-50/60 p-3">
                    <div className="flex rounded-lg bg-slate-100 p-1">
                      <button
                        type="button"
                        onClick={() =>
                          setAssignmentMode("users")
                        }
                        className={cn(
                          "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition",
                          assignmentMode === "users"
                            ? "bg-white text-slate-900 shadow-sm"
                            : "text-slate-500",
                        )}
                      >
                        Usuarios
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setAssignmentMode("teams")
                        }
                        className={cn(
                          "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition",
                          assignmentMode === "teams"
                            ? "bg-white text-slate-900 shadow-sm"
                            : "text-slate-500",
                        )}
                      >
                        Equipos
                      </button>
                    </div>

                    <div className="relative mt-2">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />

                      <Input
                        value={assignmentSearch}
                        onChange={(event) =>
                          setAssignmentSearch(
                            event.target.value,
                          )
                        }
                        placeholder={
                          assignmentMode === "users"
                            ? "Buscar usuario..."
                            : "Buscar equipo..."
                        }
                        className="h-9 bg-white pl-8 text-xs"
                      />
                    </div>
                  </div>

                  <div className="max-h-[230px] overflow-y-auto">
                    {isLoadingAssignments ? (
                      <div className="px-4 py-8 text-center text-xs text-slate-400">
                        Cargando...
                      </div>
                    ) : visibleAssignmentOptions.length === 0 ? (
                      <div className="px-4 py-8 text-center text-xs text-slate-400">
                        No hay resultados.
                      </div>
                    ) : (
                      visibleAssignmentOptions.map(
                        (option) => (
                          <div
                            key={`${option.kind}-${option.id}`}
                            className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0"
                          >
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EEF2FF] text-[#315BFF]">
                              {option.kind === "team" ? (
                                <Users className="h-3.5 w-3.5" />
                              ) : (
                                <span className="text-[9px] font-semibold">
                                  {getInitials(option.name)}
                                </span>
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-medium text-slate-900">
                                {option.name}
                              </p>

                              <p className="mt-0.5 truncate text-[10px] text-slate-400">
                                {option.secondary}
                              </p>
                            </div>

                            <Button
                              type="button"
                              variant={
                                option.assigned
                                  ? "ghost"
                                  : "outline"
                              }
                              size="sm"
                              disabled={
                                option.assigned ||
                                isAssigning
                              }
                              onClick={() =>
                                assign(option)
                              }
                              className={cn(
                                "h-8 gap-1.5 text-xs",
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
                        ),
                      )
                    )}
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>

        <SheetFooter className="shrink-0 flex-row items-center justify-end gap-2 border-t border-slate-200 bg-white px-8 py-4">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>

          <Button
            type="button"
            size="lg"
            disabled={isSaving || isGeneratingImage}
            onClick={saveCourse}
            className="gap-2 bg-[#315BFF] px-5 text-white hover:bg-[#244BE8]"
          >
            {isSaving ? "Guardando..." : "Guardar cambios"}

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
}: {
  icon: typeof BookOpen;
  title: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center text-[#315BFF]">
        <Icon className="h-[18px] w-[18px]" />
      </div>

      <h3 className="text-sm font-semibold text-slate-950">
        {title}
      </h3>
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
          ? "border-[#315BFF] bg-[#F7F8FF]"
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
        <p className="text-[11px] font-semibold text-slate-900">
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

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}