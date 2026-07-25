// components/knowledge/content/cards/folder/use-knowledge-folder-actions.ts
"use client";

import {
  useState,
  useTransition,
} from "react";
import {
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";

import {
  deleteKnowledgeLibrary,
  renameKnowledgeLibrary,
} from "@/lib/actions/knowledge-library.actions";

import type { KnowledgeLibrary } from "./types";

type Options = {
  folder: KnowledgeLibrary;
};

export function useKnowledgeFolderActions({
  folder,
}: Options) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [error, setError] = useState<string | null>(
    null,
  );

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(
    folder.name,
  );

  const [isDeleting, startDeleteTransition] =
    useTransition();

  const [isRenamingPending, startRenameTransition] =
    useTransition();

  function openFolder() {
    if (isDeleting || isRenaming) {
      return;
    }

    const params = new URLSearchParams(
      searchParams.toString(),
    );

    params.set("library", folder.id);
    params.delete("view");

    router.replace(`${pathname}?${params.toString()}`);
  }

  function openRename() {
    setRenameValue(folder.name);
    setIsRenaming(true);
  }

  function cancelRename() {
    setRenameValue(folder.name);
    setIsRenaming(false);
  }

  function saveRename() {
    const normalizedName = renameValue.trim();

    if (
      !normalizedName ||
      normalizedName === folder.name ||
      isRenamingPending
    ) {
      if (normalizedName === folder.name) {
        setIsRenaming(false);
      }

      return;
    }

    setError(null);

    startRenameTransition(async () => {
      try {
        await renameKnowledgeLibrary(
          folder.id,
          normalizedName,
        );

        setIsRenaming(false);
        router.refresh();
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "No se ha podido renombrar la carpeta",
        );
      }
    });
  }

  function deleteFolder() {
    const confirmed = window.confirm(
      `¿Quieres eliminar la carpeta "${folder.name}"?\n\nSe eliminarán también sus subcarpetas, artículos y archivos asociados. Esta acción no se puede deshacer.`,
    );

    if (!confirmed) {
      return;
    }

    setError(null);

    startDeleteTransition(async () => {
      try {
        await deleteKnowledgeLibrary(folder.id);
        router.refresh();
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "No se ha podido eliminar la carpeta",
        );
      }
    });
  }

  return {
    error,
    isDeleting,
    isRenaming,
    isRenamingPending,
    renameValue,
    setRenameValue,
    openFolder,
    openRename,
    cancelRename,
    saveRename,
    deleteFolder,
  };
}