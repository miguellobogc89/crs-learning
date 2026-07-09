// components/knowledge/upload-zone.tsx
"use client";

import { useRef, useState } from "react";

type UploadZoneProps = {
  accept: string;
  disabled?: boolean;
  onFilesChange?: (files: File[]) => void;
};

export function UploadZone({
  accept,
  disabled = false,
  onFilesChange,
}: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  function updateFiles(fileList: FileList | null) {
    const nextFiles = fileList ? Array.from(fileList) : [];

    setFiles(nextFiles);
    onFilesChange?.(nextFiles);
  }

  return (
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

        const droppedFiles = event.dataTransfer.files;
        updateFiles(droppedFiles);

        if (inputRef.current) {
          inputRef.current.files = droppedFiles;
        }
      }}
      onClick={() => {
        if (!disabled) {
          inputRef.current?.click();
        }
      }}
      className={[
        "rounded-xl border-2 border-dashed p-5 text-center transition",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        isDragging
          ? "border-primary bg-primary/10"
          : "border-border bg-surface/30 hover:border-primary hover:bg-surface/50",
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
        onChange={(event) => updateFiles(event.target.files)}
      />

      {files.length === 0 ? (
        <div className="space-y-2">
          <div className="text-3xl">📎</div>

          <p className="text-sm font-medium text-foreground">
            Arrastra archivos aquí
          </p>

          <p className="text-xs text-muted-foreground">
            o pulsa para seleccionarlos
          </p>

          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            PDF · DOCX · XLSX · PPTX · CSV · TXT
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-3xl">✅</div>

          <p className="text-sm font-medium text-foreground">
            {files.length === 1
              ? "1 archivo preparado"
              : `${files.length} archivos preparados`}
          </p>

          <div className="mx-auto max-h-32 max-w-full space-y-1 overflow-y-auto rounded-md border border-border bg-background/60 p-2 text-left">
            {files.map((file) => (
              <p
                key={`${file.name}-${file.size}`}
                className="truncate text-xs text-muted-foreground"
              >
                {file.name}
              </p>
            ))}
          </div>

          <p className="text-[11px] text-muted-foreground">
            Pulsa “Iniciar procesamiento” para analizarlos con IA.
          </p>
        </div>
      )}
    </div>
  );
}