// components/knowledge/upload-knowledge-form.tsx
"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Loader2,
  Sparkles,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";

import { uploadKnowledgeFileAction } from "@/app/actions/knowledge";
import { UploadZone } from "@/components/knowledge/upload-zone";
import { Button } from "@/components/ui/button";

type ExistingFile = {
  fileName: string;
  fileSize: number | null;
};

type Props = {
  knowledgeId: string;
  existingFiles: ExistingFile[];
  formId: string;
  onUploadableFileCountChange?: (count: number) => void;
};

const processingSteps = [
  "Preparando documentos",
  "Extrayendo contenido",
  "Guardando documentación",
  "Preparando actualización del artículo",
];

function getActiveStep(progress: number) {
  if (progress < 20) {
    return 0;
  }

  if (progress < 55) {
    return 1;
  }

  if (progress < 82) {
    return 2;
  }

  return 3;
}

function isExistingDuplicate(
  file: File,
  existingFiles: ExistingFile[],
) {
  return existingFiles.some(
    (existingFile) =>
      existingFile.fileName.toLowerCase() ===
        file.name.toLowerCase() &&
      existingFile.fileSize === file.size,
  );
}

export function UploadKnowledgeForm({
  knowledgeId,
  existingFiles,
  formId,
  onUploadableFileCountChange,
}: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState(0);
  const [isPending, startTransition] = useTransition();

  const duplicateFiles = useMemo(
    () =>
      files.filter((file) =>
        isExistingDuplicate(file, existingFiles),
      ),
    [files, existingFiles],
  );

  const uploadableFiles = useMemo(
    () =>
      files.filter(
        (file) =>
          !isExistingDuplicate(file, existingFiles),
      ),
    [files, existingFiles],
  );

  const hasUploadableFiles = uploadableFiles.length > 0;
  const hasDuplicates = duplicateFiles.length > 0;
  const activeStep = getActiveStep(progress);

  useEffect(() => {
    onUploadableFileCountChange?.(
      uploadableFiles.length,
    );
  }, [
    uploadableFiles.length,
    onUploadableFileCountChange,
  ]);

  const currentFileIndex =
    uploadableFiles.length > 0
      ? Math.min(
          uploadableFiles.length,
          Math.max(
            1,
            Math.ceil(
              (progress / 82) * uploadableFiles.length,
            ),
          ),
        )
      : 0;

  useEffect(() => {
    if (!isPending) {
      setProgress(0);
      return;
    }

    setProgress(3);

    const interval = window.setInterval(() => {
      setProgress((currentProgress) => {
        if (currentProgress >= 94) {
          return 94;
        }

        let increment = 1;

        if (currentProgress < 25) {
          increment = 3;
        } else if (currentProgress < 65) {
          increment = 2;
        }

        return Math.min(
          94,
          currentProgress + increment,
        );
      });
    }, 450);

    return () => {
      window.clearInterval(interval);
    };
  }, [isPending]);

  function handleOmitDuplicates() {
    setFiles(uploadableFiles);

    toast.info("Duplicados omitidos", {
      description:
        duplicateFiles.length === 1
          ? "Se ha retirado 1 documento que ya existía."
          : `Se han retirado ${duplicateFiles.length} documentos que ya existían.`,
    });
  }

  function handleSubmit(formData: FormData) {
    if (
      !hasUploadableFiles ||
      hasDuplicates ||
      isPending
    ) {
      return;
    }

    formData.delete("files");

    for (const file of uploadableFiles) {
      formData.append("files", file);
    }

    startTransition(async () => {
      try {
        await uploadKnowledgeFileAction(formData);

        setProgress(100);
        setFiles([]);

        toast.success("Documentos añadidos", {
          description:
            "Actualiza el conocimiento cuando termines de modificar la documentación.",
        });
      } catch (error) {
        console.error(error);

        toast.error(
          "No se han podido añadir los documentos",
        );
      }
    });
  }

  return (
    <form
      id={formId}
      action={handleSubmit}
      className="space-y-5"
    >
      <input
        type="hidden"
        name="knowledgeId"
        value={knowledgeId}
      />

      {!isPending ? (
        <>
          <UploadZone
            accept=".pdf,.txt,.md,.csv,.docx,.xlsx,.pptx,.png,.jpg,.jpeg,.webp"
            onFilesChange={setFiles}
            files={files}
          />

          {hasDuplicates ? (
            <div className="flex flex-col gap-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />

                <div>
                  <p className="text-sm font-semibold text-amber-950">
                    Documentos duplicados detectados
                  </p>

                  <p className="mt-1 text-xs leading-5 text-amber-800">
                    {duplicateFiles.length === 1
                      ? `"${duplicateFiles[0].name}" ya forma parte del artículo con el mismo nombre y tamaño.`
                      : `${duplicateFiles.length} documentos ya forman parte del artículo con el mismo nombre y tamaño.`}
                  </p>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={handleOmitDuplicates}
                className="shrink-0 border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
              >
                Omitir duplicados
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-4 rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50 to-background p-5 dark:border-cyan-900 dark:from-cyan-950/30">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-cyan-100 text-cyan-700 dark:bg-cyan-900/60 dark:text-cyan-300">
              <Sparkles className="h-6 w-6 animate-pulse" />
            </div>

            <div>
              <p className="font-semibold text-foreground">
                Incorporando nueva documentación
              </p>

              <p className="mt-1 text-sm text-muted-foreground">
                Estamos extrayendo y preparando los archivos
                para actualizar el artículo.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-3 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Procesando documentación
                </p>

                <p className="mt-0.5 text-xs text-muted-foreground">
                  Documento {currentFileIndex} de{" "}
                  {uploadableFiles.length}
                </p>
              </div>

              <span className="text-sm font-semibold text-cyan-600 dark:text-cyan-400">
                {progress}%
              </span>
            </div>

            <div className="h-2.5 overflow-hidden rounded-full bg-cyan-100 dark:bg-cyan-950">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-cyan-600 transition-[width] duration-500 ease-out"
                style={{
                  width: `${progress}%`,
                }}
              />
            </div>

            <div className="mt-5 space-y-3">
              {processingSteps.map((step, index) => {
                const isCompleted = index < activeStep;
                const isActive = index === activeStep;

                return (
                  <div
                    key={step}
                    className="flex items-center gap-3 text-sm"
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-cyan-500" />
                    ) : null}

                    {isActive ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-cyan-500" />
                    ) : null}

                    {!isCompleted && !isActive ? (
                      <Circle className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                    ) : null}

                    <span
                      className={
                        isActive
                          ? "font-medium text-foreground"
                          : "text-muted-foreground"
                      }
                    >
                      {step}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            Los documentos escaneados pueden tardar más
            mientras se realiza el reconocimiento visual.
          </p>
        </div>
      )}
    </form>
  );
}