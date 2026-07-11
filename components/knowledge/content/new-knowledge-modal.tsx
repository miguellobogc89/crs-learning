// components/knowledge/content/new-knowledge-modal.tsx
"use client";

import {
  CheckCircle2,
  Circle,
  Loader2,
  X,
} from "lucide-react";
import {
  useRef,
  useState,
  useTransition,
} from "react";

import { createKnowledgeAction } from "@/app/actions/knowledge";
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
  "Artículo creado",
  "Archivos recibidos",
  "Texto extraído",
  "Documento clasificado",
  "Resumen generado",
  "Knowledge actualizado",
];

export function NewKnowledgeModal({
  isOpen,
  libraryId,
  onClose,
}: Props) {
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [isPending, startTransition] = useTransition();

  if (!isOpen) {
    return null;
  }

  const hasFiles = files.length > 0;

  function handleClose() {
    if (isPending) {
      return;
    }

    setFiles([]);
    onClose();
  }

  function handleSubmit(formData: FormData) {
    if (isPending) {
      return;
    }

    startTransition(async () => {
      await createKnowledgeAction(formData);
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
              Crea el artículo y adjunta sus documentos
              fuente.
            </p>
          </div>

          <button
            type="button"
            disabled={isPending}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
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
              disabled={isPending}
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
              disabled={isPending}
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
              disabled={isPending}
              required
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none disabled:cursor-not-allowed disabled:opacity-60"
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
              disabled={isPending}
              onFilesChange={setFiles}
            />
          </div>

          {isPending ? (
            <div className="rounded-xl border border-border bg-background p-4">
              <div className="mb-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground">
                    Creando y procesando
                  </span>

                  <span className="text-muted-foreground">
                    Puede tardar unos segundos
                  </span>
                </div>

                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full w-3/4 animate-pulse rounded-full bg-primary" />
                </div>
              </div>

              <div className="space-y-2">
                {processingSteps.map((step, index) => {
                  const isCompleted = index < 2;
                  const isActive = index === 2;

                  return (
                    <div
                      key={step}
                      className="flex items-center gap-2 text-xs text-muted-foreground"
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                      ) : null}

                      {isActive ? (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      ) : null}

                      {!isCompleted && !isActive ? (
                        <Circle className="h-4 w-4" />
                      ) : null}

                      <span>{step}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {!isPending && hasFiles ? (
            <div className="rounded-lg border border-border bg-surface/40 px-3 py-2 text-xs text-muted-foreground">
              {files.length === 1
                ? "1 documento listo para procesar."
                : `${files.length} documentos listos para procesar.`}
            </div>
          ) : null}

          <div className="flex justify-end gap-3 border-t border-border pt-5">
            <Button
              type="button"
              variant="secondary"
              disabled={isPending}
              onClick={handleClose}
            >
              Cancelar
            </Button>

            <Button
              type="submit"
              disabled={isPending}
            >
              {isPending
                ? "Procesando..."
                : "Crear artículo"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}