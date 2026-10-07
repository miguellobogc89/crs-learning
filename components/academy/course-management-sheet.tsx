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
  if (!course) {
    return;
  }

  if (!title.trim()) {
    toast.error(
      "El título del curso es obligatorio.",
    );
    return;
  }

  const courseId = course.id;

  startSaving(async () => {
    const result = await updateCourseAction({
      courseId,
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