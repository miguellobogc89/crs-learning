// components/academy/course-editor-sheet.tsx

"use client";

import { useEffect, useState, useTransition } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";

import {
  generateCourseImageAction,
  uploadCourseImageAction,
  updateCourseAction,
} from "@/app/actions/course";
import { CourseBasicInformation } from "@/components/academy/right-panel-management/course-basic-information";
import { CourseConfiguration } from "@/components/academy/right-panel-management/course-configuration";
import { CourseManagementHeader } from "@/components/academy/right-panel-management/course-management-header";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
} from "@/components/ui/sheet";
import type { AcademyAdminCourse } from "@/lib/services/academy.service";

type TrainingType = "required" | "skills";
type CourseLevel = "beginner" | "intermediate" | "advanced";
type Difficulty = "low" | "medium" | "high";

type CourseEditorSheetProps = {
  open: boolean;
  course: AcademyAdminCourse | null;
  onOpenChange: (open: boolean) => void;
  onCourseUpdated: (course: AcademyAdminCourse) => void;
};

export function CourseEditorSheet({
  open,
  course,
  onOpenChange,
  onCourseUpdated,
}: CourseEditorSheetProps) {
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

  const [isUploadingImage, startUploadingImage] =
    useTransition();

  useEffect(() => {
    if (!open || !course) {
      return;
    }

    const evaluationConfig =
      course.evaluation_config &&
      typeof course.evaluation_config === "object" &&
      !Array.isArray(course.evaluation_config)
        ? course.evaluation_config
        : {};

    const config = evaluationConfig as {
      trainingType?: TrainingType;
      difficulty?: Difficulty;
    };

    setTitle(course.title ?? "");
    setObjective(course.description ?? "");

    setTrainingType(
      config.trainingType === "required" ||
        config.trainingType === "skills"
        ? config.trainingType
        : "skills",
    );

    setLevel(
      course.level === "beginner" ||
        course.level === "intermediate" ||
        course.level === "advanced"
        ? course.level
        : "beginner",
    );

    setDifficulty(
      config.difficulty === "low" ||
        config.difficulty === "medium" ||
        config.difficulty === "high"
        ? config.difficulty
        : "medium",
    );

    setThumbnailBlobUrl(course.thumbnail_url ?? null);

    setThumbnailPreviewUrl(
      course.thumbnail_url
        ? `/api/academy/course-cover/${course.id}`
        : null,
    );
  }, [course, open]);

  function generateImage() {
    if (!title.trim() || !objective.trim()) {
      toast.error(
        "Añade el título y la descripción antes de generar una imagen.",
      );
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

  function uploadImage(file: File) {
    const allowedTypes = [
      "image/png",
      "image/jpeg",
      "image/webp",
    ];

    if (!allowedTypes.includes(file.type)) {
      toast.error("La imagen debe ser PNG, JPG o WebP.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("La imagen no puede superar los 5 MB.");
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

  function saveChanges() {
    if (!course) {
      return;
    }

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
        description: objective.trim(),
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

      toast.success("Cambios guardados.");

      onOpenChange(false);
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
        <CourseEditHeader />

        <div className="min-h-0 flex-1 overflow-y-auto bg-white">
          <CourseBasicInformation
            title={title}
            description={objective}
            imageUrl={thumbnailPreviewUrl}
            isGeneratingImage={isGeneratingImage}
            isUploadingImage={isUploadingImage}
            onTitleChange={setTitle}
            onDescriptionChange={setObjective}
            onGenerateImage={generateImage}
            onUploadImage={uploadImage}
          />

          <CourseConfiguration
            trainingType={trainingType}
            level={level}
            difficulty={difficulty}
            onTrainingTypeChange={setTrainingType}
            onLevelChange={setLevel}
            onDifficultyChange={setDifficulty}
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
              isUploadingImage ||
              !course
            }
            onClick={saveChanges}
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