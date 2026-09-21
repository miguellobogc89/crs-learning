// create-folder-dialog/use-create-folder.ts

"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";

import { createNamedKnowledgeLibrary } from "@/lib/actions/knowledge-library.actions";
import {
  getFolderRecipients,
  type FolderRecipient,
} from "@/lib/actions/knowledge-folder-recipients.actions";

export type AccessMode = "private" | "specific";
export type AccessLevel = "read" | "edit";

type Options = {
  open: boolean;
  parentLibraryId: string | null;
  onClose: () => void;
};

export function useCreateFolder({
  open,
  parentLibraryId,
  onClose,
}: Options) {
  const router = useRouter();
  const nameInputRef = useRef<HTMLInputElement>(null);

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
  const [suggestionsOpen, setSuggestionsOpen] =
    useState(false);

  const [loadingRecipients, setLoadingRecipients] =
    useState(false);
  const [recipientsError, setRecipientsError] =
    useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    null,
  );

  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;

    setName("");
    setAccessMode("private");
    setAccessLevel("read");
    setRecipients([]);
    setSelectedIds([]);
    setSearch("");
    setSuggestionsOpen(false);
    setLoadingRecipients(false);
    setRecipientsError(null);
    setError(null);

    const timeout = window.setTimeout(
      () => nameInputRef.current?.focus(),
      0,
    );

    return () => window.clearTimeout(timeout);
  }, [open]);

  useEffect(() => {
    if (!open || accessMode !== "specific") return;

    let cancelled = false;

    async function loadRecipients() {
      setLoadingRecipients(true);
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
              : "No se han podido cargar las personas",
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingRecipients(false);
        }
      }
    }

    void loadRecipients();

    return () => {
      cancelled = true;
    };
  }, [open, accessMode]);

  const normalizedSearch = search
    .trim()
    .toLocaleLowerCase();

  const suggestions = recipients
    .filter(
      (recipient) =>
        !selectedIds.includes(recipient.id) &&
        (recipient.name
          .toLocaleLowerCase()
          .includes(normalizedSearch) ||
          recipient.email
            .toLocaleLowerCase()
            .includes(normalizedSearch)),
    )
    .slice(0, 5);

  const selectedRecipients = recipients.filter(
    (recipient) => selectedIds.includes(recipient.id),
  );

  function selectRecipient(recipientId: string) {
    setSelectedIds((current) =>
      current.includes(recipientId)
        ? current
        : [...current, recipientId],
    );

    setSearch("");
    setSuggestionsOpen(false);
  }

  function removeRecipient(recipientId: string) {
    setSelectedIds((current) =>
      current.filter((id) => id !== recipientId),
    );
  }

  function changeAccessMode(mode: AccessMode) {
    setAccessMode(mode);
    setSuggestionsOpen(false);
  }

  // La creación compartida sigue pendiente de conectar
  // con el guardado de permisos en el servidor.
  const canCreate =
    name.trim().length > 0 &&
    accessMode === "private" &&
    !isPending;

  function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!canCreate) return;

    setError(null);

    startTransition(async () => {
      try {
        await createNamedKnowledgeLibrary(
          name.trim(),
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

  return {
    nameInputRef,
    name,
    setName,
    accessMode,
    changeAccessMode,
    accessLevel,
    setAccessLevel,
    recipients,
    selectedRecipients,
    suggestions,
    search,
    setSearch,
    suggestionsOpen,
    setSuggestionsOpen,
    loadingRecipients,
    recipientsError,
    error,
    setError,
    isPending,
    canCreate,
    selectRecipient,
    removeRecipient,
    handleSubmit,
  };
}