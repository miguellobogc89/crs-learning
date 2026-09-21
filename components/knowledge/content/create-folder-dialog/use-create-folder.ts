// components/knowledge/content/create-folder-dialog/use-create-folder.ts
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
import { createSharedKnowledgeFolder } from "@/lib/actions/create-shared-knowledge-folder.actions";
import {
  getFolderRecipients,
  type FolderRecipient,
} from "@/lib/actions/knowledge-folder-recipients.actions";

export type AccessMode = "private" | "specific";
export type AccessLevel = "read" | "edit";

export type SelectedFolderRecipient = FolderRecipient & {
  external?: boolean;
};

type Options = {
  open: boolean;
  parentLibraryId: string | null;
  onClose: () => void;
};

const EMAIL_REGEX = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

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

  const [recipients, setRecipients] = useState<
    FolderRecipient[]
  >([]);

  const [selectedRecipients, setSelectedRecipients] =
    useState<SelectedFolderRecipient[]>([]);

  const [permissions, setPermissions] = useState<
    Record<string, AccessLevel>
  >({});

  const [search, setSearch] = useState("");
  const [suggestionsOpen, setSuggestionsOpen] =
    useState(false);

  const [loadingRecipients, setLoadingRecipients] =
    useState(false);

  const [recipientsError, setRecipientsError] =
    useState<string | null>(null);

  const [inputError, setInputError] =
    useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;

    setName("");
    setAccessMode("private");
    setRecipients([]);
    setSelectedRecipients([]);
    setPermissions({});
    setSearch("");
    setSuggestionsOpen(false);
    setLoadingRecipients(false);
    setRecipientsError(null);
    setInputError(null);
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

  const normalizedSearch = search.trim().toLowerCase();

  const suggestions = recipients
    .filter((recipient) => {
      const alreadySelected = selectedRecipients.some(
        (selected) =>
          selected.id === recipient.id ||
          normalizeEmail(selected.email) ===
            normalizeEmail(recipient.email),
      );

      if (alreadySelected) return false;

      return (
        recipient.name
          .toLowerCase()
          .includes(normalizedSearch) ||
        recipient.email
          .toLowerCase()
          .includes(normalizedSearch)
      );
    })
    .slice(0, 5);

  function selectRecipient(recipientId: string) {
    const recipient = recipients.find(
      (item) => item.id === recipientId,
    );

    if (!recipient) return;

    setSelectedRecipients((current) => {
      if (
        current.some(
          (item) =>
            item.id === recipient.id ||
            normalizeEmail(item.email) ===
              normalizeEmail(recipient.email),
        )
      ) {
        return current;
      }

      return [...current, recipient];
    });

    setSearch("");
    setInputError(null);
    setSuggestionsOpen(false);
  }

  function addEmails(value: string): boolean {
    const emails = value
      .split(/[\s,;]+/)
      .map(normalizeEmail)
      .filter(Boolean);

    if (emails.length === 0) return false;

    const invalidEmails = emails.filter(
      (email) => !EMAIL_REGEX.test(email),
    );

    if (invalidEmails.length > 0) {
      setInputError(
        `Correo no válido: ${invalidEmails[0]}`,
      );
      return false;
    }

    setSelectedRecipients((current) => {
      const next = [...current];

      for (const email of emails) {
        if (
          next.some(
            (recipient) =>
              normalizeEmail(recipient.email) === email,
          )
        ) {
          continue;
        }

        const existingRecipient = recipients.find(
          (recipient) =>
            normalizeEmail(recipient.email) === email,
        );

        next.push(
          existingRecipient ?? {
            id: `external:${email}`,
            name: email,
            email,
            image: null,
            external: true,
          },
        );
      }

      return next;
    });

    setSearch("");
    setInputError(null);
    setSuggestionsOpen(false);

    return true;
  }

  function removeRecipient(recipientId: string) {
    setSelectedRecipients((current) =>
      current.filter(
        (recipient) => recipient.id !== recipientId,
      ),
    );

    setPermissions((current) => {
      const next = { ...current };
      delete next[recipientId];
      return next;
    });
  }

  function changePermission(
    recipientId: string,
    permission: AccessLevel,
  ) {
    setPermissions((current) => ({
      ...current,
      [recipientId]: permission,
    }));
  }

  function changeAccessMode(mode: AccessMode) {
    setAccessMode(mode);
    setSuggestionsOpen(false);
    setInputError(null);
    setError(null);
  }

  const hasExternalRecipients =
    selectedRecipients.some(
      (recipient) => recipient.external,
    );

  const canCreate =
    name.trim().length > 0 &&
    !isPending &&
    (accessMode === "private" ||
      (selectedRecipients.length > 0 &&
        !hasExternalRecipients));

  function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!canCreate) return;

    setError(null);

    startTransition(async () => {
      try {
        if (accessMode === "private") {
          await createNamedKnowledgeLibrary(
            name.trim(),
            parentLibraryId,
          );
        } else {
          await createSharedKnowledgeFolder({
            name: name.trim(),
            parentLibraryId,
            recipients: selectedRecipients.map(
              (recipient) => ({
                userId: recipient.id,
                accessLevel:
                  permissions[recipient.id] ?? "read",
              }),
            ),
          });
        }

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
    recipients,
    selectedRecipients,
    permissions,
    changePermission,
    suggestions,
    search,
    setSearch,
    suggestionsOpen,
    setSuggestionsOpen,
    loadingRecipients,
    recipientsError,
    inputError,
    setInputError,
    error,
    setError,
    isPending,
    canCreate,
    selectRecipient,
    addEmails,
    removeRecipient,
    handleSubmit,
  };
}