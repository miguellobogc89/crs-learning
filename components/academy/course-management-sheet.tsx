// components/academy/course-management-sheet.tsx

"use client";

import {
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import {
  Check,
  Save,
  Search,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import {
  assignCourseAction,
  generateCourseImageAction,
  getCourseManagementDataAction,
  updateCourseAction,
  uploadCourseImageAction,
} from "@/app/actions/course";
import { CourseBasicInformation } from "@/components/academy/right-panel-management/course-basic-information";
import { CourseConfiguration } from "@/components/academy/right-panel-management/course-configuration";
import { CourseManagementHeader } from "@/components/academy/right-panel-management/course-management-header";
import type {
  AcademyAdminCourse,
  AcademyCourseAssignmentOption,
} from "@/lib/services/academy.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
} from "@/components/ui/sheet";
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

  const [isUploadingImage, startUploadingImage] =
    useTransition();

  const [isLoadingAssignments, startLoadingAssignments] =
    useTransition();

  const [isAssigning, startAssigning] =
    useTransition();

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
    const query =
      assignmentSearch.trim().toLowerCase();

    const kind =
      assignmentMode === "users"
        ? "user"
        : "team";

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
          option.kind === "user" &&
          option.assigned,
      ),
    [assignmentOptions],
  );

  if (!course) {
    return null;
  }

  function generateImage() {
    if (!title.trim() || !description.trim()) {
      toast.error(
        "Añade el título y la descripción antes de generar una imagen.",
      );
      return;
    }

    startGeneratingImage(async () => {
      const result =
        await generateCourseImageAction({
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

      toast.success("Portada generada.");
    });
  }

  function uploadImage(file: File) {
    const allowedTypes = [
      "image/png",
      "image/jpeg",
      "image/webp",
    ];

    if (!allowedTypes.includes(file.type)) {
      toast.error(
        "La imagen debe ser PNG, JPG o WebP.",
      );
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error(
        "La imagen no puede superar los 5 MB.",
      );
      return;
    }

    startUploadingImage(async () => {
      const formData = new FormData();

      formData.append("file", file);

      const result =
        await uploadCourseImageAction(formData);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      setThumbnailBlobUrl(result.blobUrl);
      setThumbnailPreviewUrl(result.previewUrl);

      toast.success("Portada actualizada.");
    });
  }

  function saveCourse() {
    if (!title.trim()) {
      toast.error(
        "El título del curso es obligatorio.",
      );
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
      setThumbnailPreviewUrl(
        result.course.thumbnailUrl,
      );

      toast.success("Curso actualizado.");
      onOpenChange(false);
    });
  }

function assign(
  option: AcademyCourseAssignmentOption,
) {
  if (!course || option.assigned) {
    return;
  }

  const courseId = course.id;

  startAssigning(async () => {
    const result = await assignCourseAction({
      courseId,
      targetId: option.id,
      targetType: option.kind,
    });

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    if (option.kind === "team") {
      const refreshed =
        await getCourseManagementDataAction(courseId);

      if (refreshed.ok) {
        setAssignmentOptions(
          refreshed.options,
        );
      }
    } else {
      setAssignmentOptions((current) =>
        current.map((item) =>
          item.id === option.id &&
          item.kind === option.kind
            ? {
                ...item,
                assigned: true,
              }
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
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
    >
      <SheetContent
        side="right"
        className="!w-[46vw] !max-w-[760px] min-w-[680px] gap-0 border-l border-slate-200 !bg-white p-0 shadow-2xl [&>button]:hidden"
      >
        <CourseManagementHeader mode="edit" />

        <div className="min-h-0 flex-1 overflow-y-auto bg-white">
          <CourseBasicInformation
            title={title}
            description={description}
            imageUrl={thumbnailPreviewUrl}
            isGeneratingImage={
              isGeneratingImage
            }
            isUploadingImage={
              isUploadingImage
            }
            onTitleChange={setTitle}
            onDescriptionChange={
              setDescription
            }
            onGenerateImage={
              generateImage
            }
            onUploadImage={uploadImage}
          />

          <CourseConfiguration
            trainingType={trainingType}
            level={level}
            difficulty={difficulty}
            onTrainingTypeChange={
              setTrainingType
            }
            onLevelChange={setLevel}
            onDifficultyChange={
              setDifficulty
            }
          />

          <section className="px-5 py-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center text-[#315BFF]">
                  <Users
                    className="h-[18px] w-[18px]"
                    strokeWidth={2}
                  />
                </div>

                <div>
                  <h3 className="text-[14px] font-bold leading-5 tracking-[-0.025em] text-[#071747]">
                    Asignación
                  </h3>

                  <p className="mt-0.5 text-[11.5px] leading-4 tracking-[-0.015em] text-[#536184]">
                    Gestiona los usuarios y
                    equipos asignados al curso.
                  </p>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setShowAssignmentManager(
                    (current) => !current,
                  )
                }
                className="h-8 px-3 text-[11px]"
              >
                {showAssignmentManager
                  ? "Cerrar"
                  : "Gestionar"}
              </Button>
            </div>

            {!showAssignmentManager ? (
              <div className="mt-4">
                {assignedUsers.length === 0 ? (
                  <p className="text-[11px] text-[#7180A0]">
                    Este curso todavía no tiene
                    usuarios asignados.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {assignedUsers
                      .slice(0, 5)
                      .map((user) => (
                        <div
                          key={user.id}
                          className="flex h-9 items-center gap-2 rounded-full bg-[#F7F9FF] px-2.5 pr-3"
                        >
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#E8EDFF] text-[9px] font-semibold text-[#315BFF]">
                            {getInitials(
                              user.name,
                            )}
                          </div>

                          <span className="max-w-[130px] truncate text-[10px] font-medium text-[#1B2851]">
                            {user.name}
                          </span>
                        </div>
                      ))}

                    {assignedUsers.length > 5 ? (
                      <div className="flex h-9 items-center justify-center rounded-full border border-[#DCE4FF] bg-[#F7F9FF] px-3 text-[10px] font-semibold text-[#315BFF]">
                        +
                        {assignedUsers.length -
                          5}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-4 overflow-hidden rounded-xl border border-[#DDE3F0] bg-white">
                <div className="border-b border-[#EEF1F6] bg-[#FAFBFD] p-3">
                  <div className="flex rounded-lg bg-[#F0F2F7] p-1">
                    <button
                      type="button"
                      onClick={() =>
                        setAssignmentMode(
                          "users",
                        )
                      }
                      className={cn(
                        "flex-1 rounded-md px-3 py-1.5 text-[11px] font-medium transition",
                        assignmentMode ===
                          "users"
                          ? "bg-white text-[#071747] shadow-sm"
                          : "text-[#7180A0]",
                      )}
                    >
                      Usuarios
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setAssignmentMode(
                          "teams",
                        )
                      }
                      className={cn(
                        "flex-1 rounded-md px-3 py-1.5 text-[11px] font-medium transition",
                        assignmentMode ===
                          "teams"
                          ? "bg-white text-[#071747] shadow-sm"
                          : "text-[#7180A0]",
                      )}
                    >
                      Equipos
                    </button>
                  </div>

                  <div className="relative mt-2">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8190AD]" />

                    <Input
                      value={
                        assignmentSearch
                      }
                      onChange={(event) =>
                        setAssignmentSearch(
                          event.target.value,
                        )
                      }
                      placeholder={
                        assignmentMode ===
                        "users"
                          ? "Buscar usuario..."
                          : "Buscar equipo..."
                      }
                      className="h-9 bg-white pl-8 text-[11px]"
                    />
                  </div>
                </div>

                <div className="max-h-[230px] overflow-y-auto">
                  {isLoadingAssignments ? (
                    <div className="px-4 py-8 text-center text-[11px] text-[#7180A0]">
                      Cargando...
                    </div>
                  ) : visibleAssignmentOptions.length ===
                    0 ? (
                    <div className="px-4 py-8 text-center text-[11px] text-[#7180A0]">
                      No hay resultados.
                    </div>
                  ) : (
                    visibleAssignmentOptions.map(
                      (option) => (
                        <div
                          key={`${option.kind}-${option.id}`}
                          className="flex items-center gap-3 border-b border-[#EEF1F6] px-4 py-3 last:border-0"
                        >
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EEF2FF] text-[#315BFF]">
                            {option.kind ===
                            "team" ? (
                              <Users className="h-3.5 w-3.5" />
                            ) : (
                              <span className="text-[9px] font-semibold">
                                {getInitials(
                                  option.name,
                                )}
                              </span>
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[11px] font-medium text-[#071747]">
                              {option.name}
                            </p>

                            <p className="mt-0.5 truncate text-[10px] text-[#7180A0]">
                              {
                                option.secondary
                              }
                            </p>
                          </div>

                          {option.assigned ? (
                            <div className="flex items-center gap-1 text-[10px] font-medium text-emerald-600">
                              <Check className="h-3.5 w-3.5" />
                              Asignado
                            </div>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={
                                isAssigning
                              }
                              onClick={() =>
                                assign(
                                  option,
                                )
                              }
                              className="h-8 gap-1.5 px-2.5 text-[10px]"
                            >
                              <UserPlus className="h-3.5 w-3.5" />
                              Asignar
                            </Button>
                          )}
                        </div>
                      ),
                    )
                  )}
                </div>
              </div>
            )}
          </section>
        </div>

        <SheetFooter className="shrink-0 flex-row items-center justify-between border-t border-[#EEF1F6] bg-white px-5 py-4">
          <SheetClose asChild>
            <Button
              variant="outline"
              size="lg"
            >
              Cancelar
            </Button>
          </SheetClose>

          <Button
            type="button"
            size="lg"
            disabled={
              isSaving ||
              isGeneratingImage ||
              isUploadingImage
            }
            onClick={saveCourse}
            className="gap-2 bg-[#315BFF] px-5 text-white hover:bg-[#244BE8]"
          >
            <Save className="h-4 w-4" />

            {isSaving
              ? "Guardando..."
              : "Guardar cambios"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(
      (part) =>
        part[0]?.toUpperCase(),
    )
    .join("");
}