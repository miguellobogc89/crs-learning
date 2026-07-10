// components/knowledge/knowledge-item/knowledge-file-card.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";

import { deleteKnowledgeFileAction } from "@/app/actions/knowledge";
import {
  formatFileSize,
  getKnowledgeFileIcon,
  getKnowledgeFileType,
  getKnowledgeStatus,
} from "@/lib/knowledge/file-utils";

type KnowledgeFile = {
  id: string;
  file_name: string;
  file_size: number | null;
  status: string;
};

type Props = {
  file: KnowledgeFile;
  contributionPercentage?: number | null;
  articleNeedsRebuild: boolean;
};

export function KnowledgeFileCard({
  file,
  contributionPercentage,
  articleNeedsRebuild,
}: Props) {
  const router = useRouter();

  const [error, setError] = useState<string | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();

  const extension = getKnowledgeFileType(file.file_name);
  const icon = getKnowledgeFileIcon(file.file_name);
  const status = getKnowledgeStatus(file.status);

  function handleDelete() {
    const confirmed = window.confirm(
      `¿Quieres eliminar el documento "${file.file_name}"?\n\nEl artículo quedará pendiente de actualización hasta que vuelvas a reconstruirlo.`,
    );

    if (!confirmed) {
      return;
    }

    setError(null);

    startDeleteTransition(async () => {
      try {
        await deleteKnowledgeFileAction(file.id);
        router.refresh();
      } catch (caughtError) {
        if (caughtError instanceof Error) {
          setError(caughtError.message);
          return;
        }

        setError("No se ha podido eliminar el documento");
      }
    });
  }

  let contributionLabel = "Aportación pendiente de calcular";

  if (articleNeedsRebuild) {
    contributionLabel = "Pendiente de actualización";
  } else if (
    typeof contributionPercentage === "number" &&
    Number.isFinite(contributionPercentage)
  ) {
    contributionLabel = `Aporta un ${Math.round(
      contributionPercentage,
    )} % del artículo`;
  }

  return (
    <div className="group relative rounded-xl border border-border bg-background p-4 transition hover:border-primary/40 hover:shadow-sm">
      <button
        type="button"
        onClick={handleDelete}
        disabled={isDeleting}
        className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 focus:opacity-100 disabled:cursor-not-allowed disabled:opacity-50"
        aria-label={`Eliminar ${file.file_name}`}
      >
        {isDeleting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
      </button>

      <div className="flex items-start gap-3 pr-9">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface text-lg">
          {icon}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {file.file_name}
          </p>

          <p className="mt-1 truncate text-xs text-muted-foreground">
            {extension.toUpperCase()}
            {file.file_size !== null
              ? ` · ${formatFileSize(file.file_size)}`
              : ""}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
        <span
          title={status}
          className={[
            "h-2 w-2 shrink-0 rounded-full",
            articleNeedsRebuild
              ? "bg-amber-500"
              : "bg-emerald-500",
          ].join(" ")}
        />

        <p
          className={[
            "text-xs font-medium",
            articleNeedsRebuild
              ? "text-amber-700"
              : "text-muted-foreground",
          ].join(" ")}
        >
          {contributionLabel}
        </p>
      </div>

      {error ? (
        <p className="mt-3 text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}