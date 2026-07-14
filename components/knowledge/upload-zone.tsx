// components/knowledge/upload-zone.tsx
"use client";

import Image from "next/image";
import {
  CheckCircle2,
  Loader2,
  X,
} from "lucide-react";
import { useRef, useState } from "react";

import {
  formatFileSize,
  getKnowledgeFileIcon,
  getKnowledgeFileType,
} from "@/lib/knowledge/file-utils";

type UploadZoneProps = {
  accept: string;
  disabled?: boolean;
  onFilesChange?: (files: File[]) => void;
  uploadingFileNames?: string[];
  files?: File[];
};

export function UploadZone({
  accept,
  disabled = false,
  onFilesChange,
  uploadingFileNames = [],
  files: controlledFiles,
}: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [internalFiles, setInternalFiles] = useState<File[]>([]);

const files = controlledFiles ?? internalFiles;
  const [isDragging, setIsDragging] = useState(false);

  function syncInputFiles(nextFiles: File[]) {
    if (!inputRef.current) {
      return;
    }

    const dataTransfer = new DataTransfer();

    for (const file of nextFiles) {
      dataTransfer.items.add(file);
    }

    inputRef.current.files = dataTransfer.files;
  }

function addFiles(fileList: FileList | null) {
  if (!fileList) {
    return;
  }

  const incomingFiles = Array.from(fileList);

  const nextFiles = [...files];

  for (const incomingFile of incomingFiles) {
    const alreadyExists = nextFiles.some(
      (currentFile) =>
        currentFile.name === incomingFile.name &&
        currentFile.size === incomingFile.size &&
        currentFile.lastModified === incomingFile.lastModified,
    );

    if (!alreadyExists) {
      nextFiles.push(incomingFile);
    }
  }

  setInternalFiles(nextFiles);
  syncInputFiles(nextFiles);
  onFilesChange?.(nextFiles);
}

function removeFile(fileToRemove: File) {
  if (disabled) {
    return;
  }

  const nextFiles = files.filter(
    (file) =>
      !(
        file.name === fileToRemove.name &&
        file.size === fileToRemove.size &&
        file.lastModified === fileToRemove.lastModified
      ),
  );

  setInternalFiles(nextFiles);
  syncInputFiles(nextFiles);
  onFilesChange?.(nextFiles);
}

  return (
    <div className="space-y-3">
      {files.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {files.map((file) => {
            const extension = getKnowledgeFileType(file.name);
            const icon = getKnowledgeFileIcon(file.name);

            const isUploading = uploadingFileNames.includes(
              file.name,
            );

            return (
              <div
                key={`${file.name}-${file.size}-${file.lastModified}`}
                className="group relative flex w-[220px] items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-2 shadow-sm"
              >
                <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface">
                  <Image
                    src={icon}
                    alt={`${extension || "archivo"} icono`}
                    width={24}
                    height={24}
                    className="h-6 w-6 object-contain"
                  />

                  {isUploading ? (
                    <div className="absolute inset-0 flex items-center justify-center rounded-md bg-background/85">
                      <Loader2 className="h-4 w-4 animate-spin text-cyan-600" />
                    </div>
                  ) : null}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">
                    {file.name}
                  </p>

                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {extension.toUpperCase()}
                    {file.size > 0
                      ? ` · ${formatFileSize(file.size)}`
                      : ""}
                  </p>
                </div>

                {isUploading ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-cyan-600" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                )}

                {!disabled && !isUploading ? (
                  <button
                    type="button"
                    onClick={() => removeFile(file)}
                    className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm hover:text-red-600 group-hover:flex"
                    aria-label={`Quitar ${file.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      <div
        onDragOver={(event) => {
          event.preventDefault();

          if (!disabled) {
            setIsDragging(true);
          }
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);

          if (disabled) {
            return;
          }

          addFiles(event.dataTransfer.files);
        }}
        onClick={() => {
          if (!disabled) {
            inputRef.current?.click();
          }
        }}
        className={[
          "rounded-xl border border-dashed px-5 py-3 text-center transition",
          disabled
            ? "cursor-not-allowed opacity-60"
            : "cursor-pointer",
          isDragging
            ? "border-cyan-500 bg-cyan-50/60"
            : "border-border bg-surface/20 hover:border-cyan-400 hover:bg-surface/40",
        ].join(" ")}
      >
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

        <div className="flex items-center justify-center gap-3">
          <Image
            src="/icons/files/clip.png"
            alt="Adjuntar archivos"
            width={26}
            height={26}
            className="h-5 w-5 object-contain"
          />

          <div className="text-left">
            <p className="text-sm font-medium text-foreground">
              Arrastra documentos o pulsa para seleccionarlos
            </p>

            <p className="mt-0.5 text-[11px] text-muted-foreground">
              PDF · DOCX · XLSX · PPTX · CSV · TXT
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}