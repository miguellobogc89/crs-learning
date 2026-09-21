"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Loader2,
  LockKeyhole,
  Search,
  UsersRound,
  X,
} from "lucide-react";

import { AppDialog } from "@/components/ui/app-dialog";
import { createNamedKnowledgeLibrary } from "@/lib/actions/knowledge-library.actions";
import {
  getFolderRecipients,
  type FolderRecipient,
} from "@/lib/actions/knowledge-folder-recipients.actions";

type Props = {
  open: boolean;
  parentLibraryId: string | null;
  onClose: () => void;
};

type AccessMode = "private" | "specific";
type AccessLevel = "read" | "edit";

export function CreateFolderDialog({
  open,
  parentLibraryId,
  onClose,
}: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [name, setName] = useState("");
  const [accessMode, setAccessMode] =
    useState<AccessMode>("private");
  const [accessLevel, setAccessLevel] =
    useState<AccessLevel>("read");

  const [recipients, setRecipients] = useState<
    FolderRecipient[]
  >([]);
  const [selectedIds, setSelectedIds] = useState<
    string[]
  >([]);
  const [search, setSearch] = useState("");

  const [isLoadingRecipients, setIsLoadingRecipients] =
    useState(false);
  const [recipientsError, setRecipientsError] = useState<
    string | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;

    setName("");
    setAccessMode("private");
    setAccessLevel("read");
    setRecipients([]);
    setSelectedIds([]);
    setSearch("");
    setError(null);
    setRecipientsError(null);
    setIsLoadingRecipients(false);

    const timeout = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [open]);

  useEffect(() => {
    if (!open || accessMode !== "specific") return;

    let cancelled = false;

    async function loadRecipients() {
      setIsLoadingRecipients(true);
      setRecipientsError(null);

      try {
        const result = await getFolderRecipients();

        if (!cancelled) {
          setRecipients(result);
        }
      } catch (caughtError) {
        if (!cancelled) {
          setRecipientsError(
            caughtError instanceof Error
              ? caughtError.message
              : "No se han podido cargar los usuarios",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingRecipients(false);
        }
      }
    }

    void loadRecipients();

    return () => {
      cancelled = true;
    };
  }, [open, accessMode]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isPending) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [open, isPending, onClose]);

  if (!open) return null;

  const normalizedName = name.trim();
  const normalizedSearch = search.trim().toLocaleLowerCase();

  const filteredRecipients = recipients.filter(
    (recipient) => {
      if (selectedIds.includes(recipient.id)) {
        return false;
      }

      return (
        recipient.name
          .toLocaleLowerCase()
          .includes(normalizedSearch) ||
        recipient.email
          .toLocaleLowerCase()
          .includes(normalizedSearch)
      );
    },
  );

  const selectedRecipients = recipients.filter(
    (recipient) => selectedIds.includes(recipient.id),
  );

  // Todavía no guardamos permisos compartidos.
  const canCreate =
    normalizedName.length > 0 &&
    accessMode === "private" &&
    !isPending;

  function toggleRecipient(userId: string) {
    setSelectedIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canCreate) return;

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
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "No se ha podido crear la carpeta",
        );
      }
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <AppDialog
        open={open}
        title="Nueva carpeta"
        onClose={onClose}
        disabled={isPending}
        maxWidthClassName="max-w-[620px]"
        footer={
          <>
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
          </>
        }
      >
        <div className="space-y-6">
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

            {error && (
              <p className="text-sm text-red-600">
                {error}
              </p>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-sm font-semibold text-foreground">
                Quiénes tendrán acceso
              </p>

              <p className="mt-1 text-sm text-muted-foreground">
                Elige quién quieres que tenga acceso a
                esta carpeta.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setAccessMode("private")}
              disabled={isPending}
              aria-pressed={accessMode === "private"}
              className={`flex min-h-20 w-full items-center gap-4 rounded-xl border px-4 text-left transition ${
                accessMode === "private"
                  ? "border-foreground bg-surface"
                  : "border-border hover:bg-surface"
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                  accessMode === "private"
                    ? "border-foreground bg-foreground text-background"
                    : "border-muted-foreground"
                }`}
              >
                {accessMode === "private" && (
                  <Check
                    className="h-3.5 w-3.5"
                    strokeWidth={3}
                  />
                )}
              </span>

              <LockKeyhole className="h-5 w-5 shrink-0 text-muted-foreground" />

              <span>
                <span className="block font-semibold text-foreground">
                  Solo yo
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  No añadir destinatarios a esta carpeta.
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => setAccessMode("specific")}
              disabled={isPending}
              aria-pressed={accessMode === "specific"}
              className={`flex min-h-20 w-full items-center gap-4 rounded-xl border px-4 text-left transition ${
                accessMode === "specific"
                  ? "border-foreground bg-surface"
                  : "border-border hover:bg-surface"
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                  accessMode === "specific"
                    ? "border-foreground bg-foreground text-background"
                    : "border-muted-foreground"
                }`}
              >
                {accessMode === "specific" && (
                  <Check
                    className="h-3.5 w-3.5"
                    strokeWidth={3}
                  />
                )}
              </span>

              <UsersRound className="h-5 w-5 shrink-0 text-muted-foreground" />

              <span>
                <span className="block font-semibold text-foreground">
                  Personas y equipos específicos
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Selecciona quién podrá acceder a la carpeta.
                </span>
              </span>
            </button>

            {accessMode === "specific" && (
              <div className="space-y-4 rounded-xl border border-border bg-surface/50 p-4">
                <div className="space-y-2">
                  <label
                    htmlFor="folder-recipients"
                    className="text-sm font-semibold text-foreground"
                  >
                    Personas
                  </label>

                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

                    <input
                      id="folder-recipients"
                      type="search"
                      value={search}
                      onChange={(event) =>
                        setSearch(event.target.value)
                      }
                      disabled={
                        isPending || isLoadingRecipients
                      }
                      placeholder="Buscar por nombre o correo"
                      className="h-11 w-full rounded-lg border border-border bg-background pl-10 pr-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-foreground disabled:opacity-50"
                    />
                  </div>

                  {selectedRecipients.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {selectedRecipients.map((recipient) => (
                        <span
                          key={recipient.id}
                          className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground"
                        >
                          {recipient.name}

                          <button
                            type="button"
                            onClick={() =>
                              toggleRecipient(recipient.id)
                            }
                            disabled={isPending}
                            aria-label={`Quitar a ${recipient.name}`}
                            className="rounded-full hover:bg-surface"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="max-h-52 overflow-y-auto rounded-lg border border-border bg-background">
                    {isLoadingRecipients ? (
                      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Cargando personas...
                      </div>
                    ) : recipientsError ? (
                      <p className="p-4 text-sm text-red-600">
                        {recipientsError}
                      </p>
                    ) : filteredRecipients.length === 0 ? (
                      <p className="p-4 text-sm text-muted-foreground">
                        {recipients.length === 0
                          ? "No hay otros miembros activos en este workspace."
                          : "No hay más personas que coincidan con la búsqueda."}
                      </p>
                    ) : (
                      filteredRecipients.map((recipient) => (
                        <button
                          key={recipient.id}
                          type="button"
                          onClick={() =>
                            toggleRecipient(recipient.id)
                          }
                          disabled={isPending}
                          className="flex w-full items-center justify-between gap-3 border-b border-border px-4 py-3 text-left transition last:border-b-0 hover:bg-surface disabled:opacity-50"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-foreground">
                              {recipient.name}
                            </span>

                            <span className="block truncate text-xs text-muted-foreground">
                              {recipient.email}
                            </span>
                          </span>

                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-muted-foreground" />
                        </button>
                      ))
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="folder-access-level"
                    className="text-sm font-semibold text-foreground"
                  >
                    Nivel de acceso
                  </label>

                  <select
                    id="folder-access-level"
                    value={accessLevel}
                    onChange={(event) =>
                      setAccessLevel(
                        event.target.value as AccessLevel,
                      )
                    }
                    disabled={isPending}
                    className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-foreground"
                  >
                    <option value="read">Lectura</option>
                    <option value="edit">Edición</option>
                  </select>
                </div>

                <p className="text-xs text-muted-foreground">
                  Puedes seleccionar varias personas. La
                  creación compartida se habilitará cuando
                  conectemos el guardado de permisos.
                </p>
              </div>
            )}
          </div>
        </div>
      </AppDialog>
    </form>
  );
}