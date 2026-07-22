"use client";

import Image from "next/image";
import {
  Plus,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { KnowledgeUploadFileCard } from "@/components/knowledge/upload-file-card";
import {
  formatFileSize,
} from "@/lib/knowledge/file-utils";

type UploadZoneProps = {
  accept: string;
  disabled?: boolean;
  onFilesChange?: (files: File[]) => void;
  uploadingFileNames?: string[];
  files?: File[];
};

function isSameFile(
  firstFile: File,
  secondFile: File,
) {
  return (
    firstFile.name === secondFile.name &&
    firstFile.size === secondFile.size &&
    firstFile.lastModified ===
      secondFile.lastModified
  );
}

export function UploadZone({
  accept,
  disabled = false,
  onFilesChange,
  uploadingFileNames = [],
  files: controlledFiles,
}: UploadZoneProps) {
  const inputRef =
    useRef<HTMLInputElement | null>(null);

  const [internalFiles, setInternalFiles] =
    useState<File[]>([]);

  const [isDragging, setIsDragging] =
    useState(false);

  const files =
    controlledFiles ?? internalFiles;

  const totalSize = useMemo(
    () =>
      files.reduce(
        (total, file) => total + file.size,
        0,
      ),
    [files],
  );

  function syncInputFiles(nextFiles: File[]) {
    if (!inputRef.current) {
      return;
    }

    const dataTransfer = new DataTransfer();

    for (const file of nextFiles) {
      dataTransfer.items.add(file);
    }

    inputRef.current.files =
      dataTransfer.files;
  }

  function updateFiles(nextFiles: File[]) {
    setInternalFiles(nextFiles);
    syncInputFiles(nextFiles);
    onFilesChange?.(nextFiles);
  }

  function addFiles(
    fileList: FileList | null,
  ) {
    if (!fileList) {
      return;
    }

    const nextFiles = [...files];

    for (const incomingFile of Array.from(
      fileList,
    )) {
      const alreadyExists = nextFiles.some(
        (currentFile) =>
          isSameFile(
            currentFile,
            incomingFile,
          ),
      );

      if (!alreadyExists) {
        nextFiles.push(incomingFile);
      }
    }

    updateFiles(nextFiles);
  }

  function removeFile(fileToRemove: File) {
    if (disabled) {
      return;
    }

    updateFiles(
      files.filter(
        (file) =>
          !isSameFile(file, fileToRemove),
      ),
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <input
        ref={inputRef}
        hidden
        multiple
        name="files"
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={(event) => {
          addFiles(event.target.files);
          event.target.value = "";
        }}
      />

      <section className="shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Documentos seleccionados
            </h3>

            <p className="mt-0.5 text-xs text-muted-foreground">
              {files.length}{" "}
              {files.length === 1
                ? "archivo"
                : "archivos"}
              {totalSize > 0
                ? ` · ${formatFileSize(totalSize)}`
                : ""}
            </p>
          </div>

          <button
            type="button"
            disabled={disabled}
            onClick={() =>
              inputRef.current?.click()
            }
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-cyan-200 bg-background px-3 text-sm font-medium text-cyan-700 transition hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-cyan-900 dark:text-cyan-300 dark:hover:bg-cyan-950/30"
          >
            <Plus className="h-4 w-4" />
            Añadir más
          </button>
        </div>

<div className="mt-3 min-w-0 overflow-x-auto overscroll-x-contain pb-2">
  {files.length > 0 ? (
    <div className="flex min-w-max gap-2">
      {files.map((file) => (
        <div
          key={`${file.name}-${file.size}-${file.lastModified}`}
          className="w-[250px] shrink-0 xl:w-[270px] 2xl:w-[290px]"
        >
          <KnowledgeUploadFileCard
            file={file}
            disabled={disabled}
            isUploading={uploadingFileNames.includes(file.name)}
            onRemove={removeFile}
          />
        </div>
      ))}
    </div>
  ) : (
    <div className="flex min-h-16 items-center justify-center rounded-xl bg-surface/30 px-4 text-sm text-muted-foreground">
      No hay documentos seleccionados.
    </div>
  )}
</div>
      </section>

      <div
        onDragOver={(event) => {
          event.preventDefault();

          if (!disabled) {
            setIsDragging(true);
          }
        }}
        onDragLeave={() =>
          setIsDragging(false)
        }
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);

          if (disabled) {
            return;
          }

          addFiles(
            event.dataTransfer.files,
          );
        }}
        onClick={() => {
          if (!disabled) {
            inputRef.current?.click();
          }
        }}
        className={[
          "flex min-h-24 shrink-0 items-center justify-center rounded-xl border border-dashed px-5 py-4 transition",
          disabled
            ? "cursor-not-allowed opacity-60"
            : "cursor-pointer",
          isDragging
            ? "border-cyan-500 bg-cyan-50 dark:bg-cyan-950/30"
            : "border-cyan-300 bg-cyan-50/30 hover:border-cyan-500 hover:bg-cyan-50/70 dark:border-cyan-900 dark:bg-cyan-950/10 dark:hover:bg-cyan-950/30",
        ].join(" ")}
      >
        <div className="flex items-center gap-3 text-left">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-100 dark:bg-cyan-900/50">
<Image
  src="/icons/files/clip.png"
  alt="Adjuntar archivos"
  width={40}
  height={40}
  className="h-6 w-6 object-contain"
/>
          </div>

          <div>
            <p className="text-sm font-semibold text-foreground">
              Añadir más documentación
            </p>

            <p className="mt-0.5 text-xs text-muted-foreground">
              Arrastra archivos aquí o pulsa para seleccionarlos
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
