// components/knowledge/upload-file-card.tsx
"use client";

import Image from "next/image";
import {
  CheckCircle2,
  Loader2,
  X,
} from "lucide-react";

import {
  formatFileSize,
  getKnowledgeFileIcon,
  getKnowledgeFileType,
} from "@/lib/knowledge/file-utils";

type KnowledgeUploadFileCardProps = {
  file: File;
  disabled?: boolean;
  isUploading?: boolean;
  onRemove: (file: File) => void;
};

export function KnowledgeUploadFileCard({
  file,
  disabled = false,
  isUploading = false,
  onRemove,
}: KnowledgeUploadFileCardProps) {
  const extension =
    getKnowledgeFileType(file.name);

  const icon =
    getKnowledgeFileIcon(file.name);

  let statusLabel = "Listo para subir";

  if (isUploading) {
    statusLabel = "Subiendo...";
  }

  return (
    <article className="group relative w-[230px] shrink-0 rounded-xl border border-border bg-background p-3 transition hover:border-primary/40 hover:shadow-sm xl:w-[240px] 2xl:w-[250px]">
      {!disabled && !isUploading ? (
        <button
          type="button"
          onClick={() => onRemove(file)}
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 focus:opacity-100 dark:hover:bg-red-950/30"
          aria-label={`Quitar ${file.name}`}
          title="Quitar archivo"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}

      <div className="flex min-w-0 items-start gap-2.5 pr-7">
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface">
          <Image
            src={icon}
            alt={`${extension || "archivo"} icono`}
            width={24}
            height={24}
            quality={100}
            className="h-6 w-6 object-contain"
          />

          {isUploading ? (
            <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/85">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-600" />
            </span>
          ) : null}
        </span>

        <div className="min-w-0 flex-1">
          <p
            className="truncate text-[13px] font-semibold leading-4 text-foreground"
            title={file.name}
          >
            {file.name}
          </p>

          <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[10px] leading-3.5 text-muted-foreground">
            <span className="shrink-0">
              {(extension || "archivo").toUpperCase()}
            </span>

            {file.size > 0 ? (
              <>
                <span aria-hidden="true">·</span>

                <span className="shrink-0">
                  {formatFileSize(file.size)}
                </span>
              </>
            ) : null}

            <span aria-hidden="true">·</span>

            <span className="flex min-w-0 items-center gap-1 truncate font-medium">
              {isUploading ? (
                <Loader2 className="h-3 w-3 shrink-0 animate-spin text-cyan-600" />
              ) : (
                <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-600" />
              )}

              <span className="truncate">
                {statusLabel}
              </span>
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}