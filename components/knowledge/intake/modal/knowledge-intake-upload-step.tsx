// components/knowledge/intake/modal/knowledge-intake-upload-step.tsx
"use client";

import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import {
  FilePlus2,
  UploadCloud,
} from "lucide-react";

import { KnowledgeUploadFileCard } from "@/components/knowledge/upload-file-card";
import { cn } from "@/lib/utils";

type Props = {
  files: File[];
  isAnalyzing: boolean;
  error: string | null;
  onFilesChange: (files: File[]) => void;
};

type FileCategory =
  | "pdf"
  | "document"
  | "spreadsheet"
  | "presentation"
  | "archive"
  | "image"
  | "other";

const FILE_CATEGORY_LABELS: Record<
  FileCategory,
  {
    singular: string;
    plural: string;
  }
> = {
  pdf: {
    singular: "PDF",
    plural: "PDF",
  },
  document: {
    singular: "documento",
    plural: "documentos",
  },
  spreadsheet: {
    singular: "hoja de cálculo",
    plural: "hojas de cálculo",
  },
  presentation: {
    singular: "presentación",
    plural: "presentaciones",
  },
  archive: {
    singular: "archivo comprimido",
    plural: "archivos comprimidos",
  },
  image: {
    singular: "imagen",
    plural: "imágenes",
  },
  other: {
    singular: "otro archivo",
    plural: "otros archivos",
  },
};

function getFileCategory(
  file: File,
): FileCategory {
  const extension =
    file.name
      .split(".")
      .pop()
      ?.toLowerCase() ?? "";

  if (extension === "pdf") {
    return "pdf";
  }

  if (
    [
      "doc",
      "docx",
      "odt",
      "rtf",
      "txt",
      "md",
    ].includes(extension)
  ) {
    return "document";
  }

  if (
    [
      "xls",
      "xlsx",
      "xlsm",
      "csv",
      "ods",
    ].includes(extension)
  ) {
    return "spreadsheet";
  }

  if (
    [
      "ppt",
      "pptx",
      "odp",
    ].includes(extension)
  ) {
    return "presentation";
  }

  if (
    [
      "zip",
      "rar",
      "7z",
      "tar",
      "gz",
    ].includes(extension)
  ) {
    return "archive";
  }

  if (
    [
      "png",
      "jpg",
      "jpeg",
      "webp",
      "gif",
      "svg",
    ].includes(extension)
  ) {
    return "image";
  }

  return "other";
}

export function KnowledgeIntakeUploadStep({
  files,
  isAnalyzing,
  error,
  onFilesChange,
}: Props) {
  const inputRef =
    useRef<HTMLInputElement>(null);

  const [isDragging, setIsDragging] =
    useState(false);

  const fileSummary = useMemo(() => {
    const counts = new Map<
      FileCategory,
      number
    >();

    for (const file of files) {
      const category =
        getFileCategory(file);

      counts.set(
        category,
        (counts.get(category) ?? 0) + 1,
      );
    }

    return Array.from(
      counts.entries(),
    ).map(([category, count]) => {
      const labels =
        FILE_CATEGORY_LABELS[category];

      return {
        category,
        count,
        label:
          count === 1
            ? labels.singular
            : labels.plural,
      };
    });
  }, [files]);

  function addFiles(nextFiles: File[]) {
    if (
      nextFiles.length === 0 ||
      isAnalyzing
    ) {
      return;
    }

    onFilesChange([
      ...files,
      ...nextFiles,
    ]);
  }

  function handleInputChange(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const selectedFiles = Array.from(
      event.target.files ?? [],
    );

    event.target.value = "";

    addFiles(selectedFiles);
  }

  function handleDragEnter(
    event: DragEvent<HTMLDivElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();

    if (!isAnalyzing) {
      setIsDragging(true);
    }
  }

  function handleDragOver(
    event: DragEvent<HTMLDivElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();

    if (!isAnalyzing) {
      event.dataTransfer.dropEffect =
        "copy";

      setIsDragging(true);
    }
  }

  function handleDragLeave(
    event: DragEvent<HTMLDivElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();

    const nextTarget =
      event.relatedTarget as Node | null;

    if (
      nextTarget &&
      event.currentTarget.contains(
        nextTarget,
      )
    ) {
      return;
    }

    setIsDragging(false);
  }

  function handleDrop(
    event: DragEvent<HTMLDivElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();

    setIsDragging(false);

    const droppedFiles = Array.from(
      event.dataTransfer.files ?? [],
    );

    addFiles(droppedFiles);
  }

  function handleRemove(
    fileToRemove: File,
  ) {
    onFilesChange(
      files.filter(
        (file) =>
          file !== fileToRemove,
      ),
    );
  }

  function openFilePicker() {
    if (isAnalyzing) {
      return;
    }

    inputRef.current?.click();
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-4">
      {files.length > 0 ? (
        <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1">
          <p className="mr-1 text-sm font-semibold text-foreground">
            {files.length}{" "}
            {files.length === 1
              ? "archivo seleccionado"
              : "archivos seleccionados"}
          </p>

          <span className="text-muted-foreground">
            ·
          </span>

          {fileSummary.map(
            (
              {
                category,
                count,
                label,
              },
              index,
            ) => (
              <div
                key={category}
                className="flex items-center gap-2 text-xs text-muted-foreground"
              >
                {index > 0 ? (
                  <span aria-hidden="true">
                    ·
                  </span>
                ) : null}

                <span>
                  <strong className="font-medium text-foreground">
                    {count}
                  </strong>{" "}
                  {label}
                </span>
              </div>
            ),
          )}
        </div>
      ) : null}

      {files.length > 0 ? (
        <div className="min-w-0 shrink-0 overflow-x-auto overscroll-x-contain pb-2">
          <div className="flex min-w-max gap-3">
            {files.map(
              (file, index) => (
                <KnowledgeUploadFileCard
                  key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                  file={file}
                  disabled={isAnalyzing}
                  isUploading={
                    isAnalyzing
                  }
                  onRemove={
                    handleRemove
                  }
                />
              ),
            )}
          </div>
        </div>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        disabled={isAnalyzing}
        onChange={handleInputChange}
      />

      <div
        role="button"
        tabIndex={isAnalyzing ? -1 : 0}
        aria-disabled={isAnalyzing}
        onClick={openFilePicker}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" ||
            event.key === " "
          ) {
            event.preventDefault();
            openFilePicker();
          }
        }}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "group flex min-h-0 flex-1 cursor-pointer items-center justify-center rounded-xl border border-dashed px-6 py-6 transition",
          "border-border bg-muted/20 hover:border-foreground/25 hover:bg-muted/35",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          isDragging &&
            "border-cyan-500 bg-cyan-50/70 dark:bg-cyan-950/20",
          isAnalyzing &&
            "cursor-not-allowed opacity-60",
        )}
      >
        <div className="flex max-w-md flex-col items-center text-center">
          <div
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition",
              "group-hover:text-foreground",
              isDragging &&
                "border-cyan-200 bg-cyan-100 text-cyan-700",
            )}
          >
            {isDragging ? (
              <FilePlus2 className="h-5 w-5" />
            ) : (
              <UploadCloud className="h-5 w-5" />
            )}
          </div>

          <p className="mt-4 text-sm font-semibold text-foreground">
            {isDragging
              ? "Suelta los archivos aquí"
              : files.length > 0
                ? "Arrastra más archivos aquí"
                : "Arrastra archivos aquí"}
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            También puedes hacer clic para
            seleccionarlos desde tu equipo
          </p>
        </div>
      </div>

      {error ? (
        <div className="shrink-0 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
          {error}
        </div>
      ) : null}
    </div>
  );
}