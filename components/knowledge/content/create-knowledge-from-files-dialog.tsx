// components/knowledge/content/create-knowledge-from-files-dialog.tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { FileUp, Loader2, X } from "lucide-react";

import { createKnowledgeFromFolderUploadAction } from "@/app/actions/knowledge";
import { UploadZone } from "@/components/knowledge/upload-zone";

type Props = {
  open: boolean;
  libraryId: string | null;
  libraryName: string;
  onClose: () => void;
};

export function CreateKnowledgeFromFilesDialog({
  open,
  libraryId,
  libraryName,
  onClose,
}: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) {
      return;
    }

    setFiles([]);
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      if (isPending) {
        return;
      }

      onClose();
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isPending, onClose, open]);

  if (!open) {
    return null;
  }

  const canSubmit =
    Boolean(libraryId) &&
    files.length > 0 &&
    !isPending;

  function handleBackdropClick(
    event: React.MouseEvent<HTMLDivElement>,
  ) {
    if (event.target !== event.currentTarget) {
      return;
    }

    if (isPending) {
      return;
    }

    onClose();
  }

  function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!canSubmit || !libraryId) {
      return;
    }

    setError(null);

    const formData = new FormData();
    formData.set("libraryId", libraryId);

    for (const file of files) {
      formData.append("files", file);
    }

    startTransition(async () => {
      try {
        await createKnowledgeFromFolderUploadAction(
          formData,
        );
      } catch (caughtError) {
        if (caughtError instanceof Error) {
          setError(caughtError.message);
          return;
        }

        setError(
          "No se ha podido crear el artículo a partir de los documentos",
        );
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-8"
      onMouseDown={handleBackdropClick}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-knowledge-title"
        className="w-full max-w-2xl rounded-2xl bg-background shadow-2xl"
      >
        <form onSubmit={handleSubmit}>
          <header className="flex items-start justify-between gap-6 border-b border-border px-7 py-6">
            <div>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface text-foreground">
                  <FileUp className="h-5 w-5" />
                </span>

                <div>
                  <h2
                    id="create-knowledge-title"
                    className="text-xl font-semibold text-foreground"
                  >
                    Subir documentos
                  </h2>

                  <p className="mt-1 text-sm text-muted-foreground">
                    Crearás un artículo nuevo dentro de{" "}
                    <strong className="font-semibold text-foreground">
                      {libraryName}
                    </strong>
                    .
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-surface hover:text-foreground disabled:opacity-40"
              aria-label="Cerrar"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="px-7 py-6">
            {libraryId ? (
              <UploadZone
                accept=".pdf,.txt,.md,.csv,.docx,.xlsx,.pptx"
                disabled={isPending}
                onFilesChange={setFiles}
              />
            ) : (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                Selecciona primero una carpeta en la que
                crear el artículo.
              </div>
            )}

            {files.length > 0 && !isPending ? (
              <div className="mt-4 rounded-xl border border-border bg-surface/40 px-4 py-3">
                <p className="text-sm font-medium text-foreground">
                  {files.length === 1
                    ? "1 documento seleccionado"
                    : `${files.length} documentos seleccionados`}
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  El sistema creará un artículo, extraerá el
                  contenido y ejecutará el análisis IA.
                </p>
              </div>
            ) : null}

            {isPending ? (
              <div className="mt-4 rounded-xl border border-border bg-surface/40 px-4 py-4">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-lesson" />

                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Creando el artículo…
                    </p>

                    <p className="mt-1 text-xs text-muted-foreground">
                      Estamos extrayendo y analizando los
                      documentos. No cierres esta ventana.
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            {error ? (
              <p className="mt-4 text-sm text-red-600">
                {error}
              </p>
            ) : null}
          </div>

          <footer className="flex items-center justify-end gap-3 border-t border-border px-7 py-5">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="h-10 rounded-lg px-4 text-sm font-semibold text-foreground transition hover:bg-surface disabled:opacity-40"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileUp className="h-4 w-4" />
              )}

              {isPending
                ? "Creando artículo…"
                : "Crear artículo"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}