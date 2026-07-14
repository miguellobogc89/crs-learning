// components/knowledge/content/new-knowledge-modal.tsx
"use client";

import {
  CheckCircle2,
  Circle,
  FileSearch,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";

import { createKnowledgeWithDocumentsAction } from "@/app/actions/knowledge/article.actions";
import { UploadZone } from "@/components/knowledge/upload-zone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  isOpen: boolean;
  libraryId: string;
  onClose: () => void;
};

const knowledgeTypes = [
  { value: "procedure", label: "Procedimiento" },
  {
    value: "technical_instruction",
    label: "Instrucción técnica",
  },
  { value: "regulation", label: "Normativa" },
  { value: "manual", label: "Manual" },
  {
    value: "technical_specification",
    label: "Especificación técnica",
  },
  { value: "report", label: "Informe" },
  { value: "contract", label: "Contrato" },
  { value: "other", label: "Otro" },
];

const processingSteps = [
  "Preparando documentos",
  "Extrayendo contenido",
  "Interpretando la documentación",
  "Generando conocimiento",
  "Construyendo el artículo",
];

function getActiveStep(progress: number) {
  if (progress < 15) {
    return 0;
  }

  if (progress < 45) {
    return 1;
  }

  if (progress < 68) {
    return 2;
  }

  if (progress < 86) {
    return 3;
  }

  return 4;
}

export function NewKnowledgeModal({
  isOpen,
  libraryId,
  onClose,
}: Props) {
  const backdropRef = useRef<HTMLDivElement | null>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState(0);
  const [isPending, startTransition] = useTransition();

  const hasFiles = files.length > 0;
  const activeStep = getActiveStep(progress);

  const currentFileIndex =
    files.length > 0
      ? Math.min(
          files.length,
          Math.max(
            1,
            Math.ceil((progress / 75) * files.length),
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
        } else if (currentProgress < 60) {
          increment = 2;
        }

        return Math.min(94, currentProgress + increment);
      });
    }, 450);

    return () => {
      window.clearInterval(interval);
    };
  }, [isPending]);

  if (!isOpen) {
    return null;
  }

  function handleClose() {
    if (isPending) {
      return;
    }

    setFiles([]);
    setProgress(0);
    onClose();
  }

function handleSubmit(formData: FormData) {
  if (isPending || !hasFiles) {
    return;
  }

  formData.delete("files");

  for (const file of files) {
    formData.append("files", file);
  }

  startTransition(async () => {
    await createKnowledgeWithDocumentsAction(formData);
  });
}

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onMouseDown={(event) => {
        if (
          event.target === backdropRef.current &&
          !isPending
        ) {
          handleClose();
        }
      }}
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-background shadow-xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-border bg-background px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold">
              Nuevo artículo
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Añade la información y la documentación que analizará
              la IA.
            </p>
          </div>

          <button
            type="button"
            disabled={isPending}
            className="rounded-md p-1.5 text-muted-foreground transition hover:bg-surface hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            onClick={handleClose}
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          action={handleSubmit}
          className="space-y-5 p-6"
        >
          <input
            type="hidden"
            name="libraryId"
            value={libraryId}
          />

          <input
            type="hidden"
            name="visibility"
            value="private"
          />

          {!isPending ? (
            <>
              <div className="space-y-2">
                <label
                  htmlFor="knowledge-title"
                  className="text-sm font-medium text-foreground"
                >
                  Título
                </label>

                <Input
                  id="knowledge-title"
                  name="title"
                  placeholder="Ej. Procedimiento de puesta en marcha"
                  autoFocus
                  required
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="knowledge-description"
                  className="text-sm font-medium text-foreground"
                >
                  Descripción
                </label>

                <Textarea
                  id="knowledge-description"
                  name="description"
                  placeholder="Resume el objetivo, alcance y contenido del artículo."
                  className="min-h-24"
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="knowledge-type"
                  className="text-sm font-medium text-foreground"
                >
                  Tipología
                </label>

                <select
                  id="knowledge-type"
                  name="knowledgeType"
                  defaultValue=""
                  required
                  className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none"
                >
                  <option value="" disabled>
                    Seleccionar tipología
                  </option>

                  {knowledgeTypes.map((type) => (
                    <option
                      key={type.value}
                      value={type.value}
                    >
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Documentos fuente
                </label>

                <UploadZone
                  accept=".pdf,.txt,.md,.csv,.docx,.xlsx,.pptx"
                  onFilesChange={setFiles}
                />
              </div>

              {hasFiles ? (
                <div className="flex items-center gap-3 rounded-xl border border-cyan-200 bg-cyan-50/60 px-4 py-3 dark:border-cyan-900 dark:bg-cyan-950/20">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300">
                    <FileSearch className="h-4 w-4" />
                  </div>

                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Documentación preparada
                    </p>

                    <p className="text-xs text-muted-foreground">
                      {files.length === 1
                        ? "1 documento listo para analizar."
                        : `${files.length} documentos listos para analizar.`}
                    </p>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="space-y-6 py-2">
              <div className="flex items-center gap-4 rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50 to-background p-5 dark:border-cyan-900 dark:from-cyan-950/30">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-cyan-100 text-cyan-700 dark:bg-cyan-900/60 dark:text-cyan-300">
                  <Sparkles className="h-6 w-6 animate-pulse" />
                </div>

                <div>
                  <p className="font-semibold text-foreground">
                    La IA está interpretando tu documentación
                  </p>

                  <p className="mt-1 text-sm text-muted-foreground">
                    Estamos extrayendo el contenido y construyendo el
                    conocimiento del artículo.
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
                      Documento {currentFileIndex} de {files.length}
                    </p>
                  </div>

                  <span className="text-sm font-semibold text-cyan-600 dark:text-cyan-400">
                    {progress}%
                  </span>
                </div>

                <div className="h-2.5 overflow-hidden rounded-full bg-cyan-100 dark:bg-cyan-950">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-cyan-600 transition-[width] duration-500 ease-out"
                    style={{ width: `${progress}%` }}
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
                Los documentos escaneados pueden tardar algo más
                mientras se realiza el reconocimiento visual.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-3 border-t border-border pt-5">
            {!isPending ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleClose}
                >
                  Cancelar
                </Button>

                <Button
                  type="submit"
                  disabled={!hasFiles}
                  className="bg-cyan-600 text-white hover:bg-cyan-700"
                >
                  Crear y analizar artículo
                </Button>
              </>
            ) : (
              <Button type="button" disabled>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Procesando
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}