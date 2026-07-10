// components/knowledge/content/create-folder-dialog.tsx
"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";

import { createNamedKnowledgeLibrary } from "@/lib/actions/knowledge-library.actions";

type Props = {
  open: boolean;
  parentLibraryId: string | null;
  onClose: () => void;
};

export function CreateFolderDialog({
  open,
  parentLibraryId,
  onClose,
}: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) {
      return;
    }

    setName("");
    setError(null);

    window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
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
  }, [open, isPending, onClose]);

  if (!open) {
    return null;
  }

  const normalizedName = name.trim();
  const canCreate = normalizedName.length > 0 && !isPending;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canCreate) {
      return;
    }

    setError(null);

    startTransition(async () => {
      try {
        await createNamedKnowledgeLibrary(
          normalizedName,
          parentLibraryId,
        );

        router.refresh();
        onClose();
      } catch (caughtError) {
        if (caughtError instanceof Error) {
          setError(caughtError.message);
          return;
        }

        setError("No se ha podido crear la carpeta");
      }
    });
  }

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-8"
      onMouseDown={handleBackdropClick}
    >
      <section
        className="w-full max-w-[500px] rounded-2xl bg-background shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-folder-title"
      >
        <form onSubmit={handleSubmit}>
          <div className="flex items-center justify-between px-8 pt-7">
            <h2
              id="create-folder-title"
              className="text-xl font-semibold text-foreground"
            >
              Nueva carpeta
            </h2>

            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-surface hover:text-foreground"
              onClick={onClose}
              disabled={isPending}
              aria-label="Cerrar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-6 px-8 py-6">
            <div className="space-y-2">
              <label
                htmlFor="folder-name"
                className="text-sm font-semibold text-foreground"
              >
                Nombre de carpeta
              </label>

              <input
                ref={inputRef}
                id="folder-name"
                type="text"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setError(null);
                }}
                placeholder="Nueva carpeta"
                maxLength={120}
                disabled={isPending}
                className="h-12 w-full rounded-lg border border-border bg-background px-4 text-base text-foreground outline-none transition placeholder:text-muted-foreground focus:border-foreground"
              />

              {error ? (
                <p className="text-sm text-red-600">{error}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Quiénes tendrán acceso
                </p>

                <p className="mt-1 text-sm text-muted-foreground">
                  Elige quién quieres que tenga acceso a esta carpeta.
                </p>
              </div>

              <button
                type="button"
                className="flex min-h-20 w-full items-center gap-4 rounded-xl border border-foreground bg-surface px-4 text-left"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                </span>

                <span className="font-semibold text-foreground">
                  Solo yo
                </span>
              </button>

              <button
                type="button"
                disabled
                className="flex min-h-20 w-full cursor-not-allowed items-center gap-4 rounded-xl border border-border px-4 text-left opacity-50"
              >
                <span className="h-5 w-5 shrink-0 rounded-full border border-muted-foreground" />

                <span>
                  <span className="block font-semibold text-foreground">
                    Personas y equipos específicos
                  </span>

                  <span className="mt-1 block text-xs text-muted-foreground">
                    Disponible próximamente
                  </span>
                </span>
              </button>
            </div>
          </div>

          <footer className="flex items-center justify-end gap-3 border-t border-border px-8 py-5">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="h-10 rounded-lg px-4 text-sm font-semibold text-foreground transition hover:bg-surface disabled:opacity-50"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={!canCreate}
              className="h-10 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isPending ? "Creando..." : "Crear"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}