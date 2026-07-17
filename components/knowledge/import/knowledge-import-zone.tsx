// components/knowledge/import/knowledge-import-zone.tsx

"use client";

import {
  Archive,
  FileText,
  FolderOpen,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import {
  DragEvent,
  useMemo,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import { formatFileSize } from "@/lib/knowledge/file-utils";

import {
  mergeKnowledgeImportFiles,
  type KnowledgeImportFile,
  type KnowledgeImportMode,
} from "./knowledge-import.types";
import { KnowledgeUploadMenu } from "./knowledge-upload-menu";

type Props = {
  libraryId: string;
  libraryName: string;
  disabled?: boolean;
  onCreateArticle?: () => void;
  onAnalyze?: (payload: {
    libraryId: string;
    mode: KnowledgeImportMode;
    files: KnowledgeImportFile[];
    importId: string;
  }) => void | Promise<void>;
};

function getModeLabel(mode: KnowledgeImportMode) {
  if (mode === "folder") {
    return "carpeta";
  }

  if (mode === "zip") {
    return "archivo ZIP";
  }

  return "archivos";
}

function getModeIcon(mode: KnowledgeImportMode) {
  if (mode === "folder") {
    return FolderOpen;
  }

  if (mode === "zip") {
    return Archive;
  }

  return FileText;
}

export function KnowledgeImportZone({
  libraryId,
  libraryName,
  disabled = false,
  onCreateArticle,
  onAnalyze,
}: Props) {
  const dropInputRef =
    useRef<HTMLInputElement | null>(null);

  const [mode, setMode] =
    useState<KnowledgeImportMode>("files");
  const [files, setFiles] = useState<
    KnowledgeImportFile[]
  >([]);
  const [isDragging, setIsDragging] =
    useState(false);
  const [isAnalyzing, setIsAnalyzing] =
    useState(false);
  const [error, setError] =
    useState<string | null>(null);

  const totalSize = useMemo(
    () =>
      files.reduce(
        (total, currentFile) =>
          total + currentFile.size,
        0,
      ),
    [files],
  );

  const foldersCount = useMemo(() => {
    const folderPaths = new Set<string>();

    for (const file of files) {
      const pathParts =
        file.relativePath.split("/");

      if (pathParts.length <= 1) {
        continue;
      }

      pathParts.pop();

      let currentPath = "";

      for (const pathPart of pathParts) {
        currentPath = currentPath
          ? `${currentPath}/${pathPart}`
          : pathPart;

        folderPaths.add(currentPath);
      }
    }

    return folderPaths.size;
  }, [files]);

  function addFiles(
    nextMode: KnowledgeImportMode,
    incomingFiles: File[],
  ) {
    setMode(nextMode);
    setError(null);

    setFiles((currentFiles) =>
      mergeKnowledgeImportFiles(
        currentFiles,
        incomingFiles,
      ),
    );
  }

  function removeFile(fileId: string) {
    setFiles((currentFiles) =>
      currentFiles.filter(
        (file) => file.id !== fileId,
      ),
    );
  }

  function resetImport() {
    if (isAnalyzing) {
      return;
    }

    setFiles([]);
    setError(null);
    setMode("files");
  }

  async function handleAnalyze() {
    if (
      files.length === 0 ||
      isAnalyzing ||
      disabled
    ) {
      return;
    }

    setError(null);
    setIsAnalyzing(true);

try {
  const formData = new FormData();

  formData.append("libraryId", libraryId);
  formData.append("mode", mode);

  const relativePaths: string[] = [];

  for (const item of files) {
    formData.append("files", item.file);

    relativePaths.push(
      item.relativePath ?? item.name,
    );
  }

  formData.append(
    "relativePaths",
    JSON.stringify(relativePaths),
  );

  const response = await fetch(
    "/api/knowledge/import/upload",
    {
      method: "POST",
      body: formData,
    },
  );

  if (!response.ok) {
    const body = await response
      .json()
      .catch(() => null);

    throw new Error(
      body?.error ??
        "No se ha podido subir la documentación.",
    );
  }

  const result = await response.json();

  await onAnalyze?.({
    libraryId,
    mode,
    files,
    importId: result.importId,
  });
} catch (caughtError) { 
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se ha podido analizar la documentación",
      );
    } finally {
      setIsAnalyzing(false);
    }
  }

  function handleDrop(
    event: DragEvent<HTMLDivElement>,
  ) {
    event.preventDefault();
    setIsDragging(false);

    if (disabled || isAnalyzing) {
      return;
    }

    const droppedFiles = Array.from(
      event.dataTransfer.files,
    );

    if (droppedFiles.length === 0) {
      return;
    }

    const containsZip = droppedFiles.some(
      (file) =>
        file.name.toLowerCase().endsWith(".zip"),
    );

    addFiles(
      containsZip ? "zip" : "files",
      droppedFiles,
    );
  }

  if (files.length === 0) {
    return (
      <div
        onDragOver={(event) => {
          event.preventDefault();

          if (!disabled) {
            setIsDragging(true);
          }
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={[
          "flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-12 text-center transition-colors",
          isDragging
            ? "border-cyan-500 bg-cyan-50/60 dark:bg-cyan-950/20"
            : "border-border bg-background",
        ].join(" ")}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-300">
          <UploadCloud className="h-6 w-6" />
        </div>

        <h2 className="mt-5 text-base font-semibold text-foreground">
          Añade documentación a {libraryName}
        </h2>

        <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
          Sube documentos, una carpeta completa o un
          archivo ZIP. La IA analizará el contenido y
          propondrá cómo organizarlo antes de crear nada.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <KnowledgeUploadMenu
            disabled={disabled}
            onSelect={addFiles}
          />

          {onCreateArticle ? (
            <Button
              type="button"
              variant="outline"
              onClick={onCreateArticle}
            >
              Nuevo artículo manual
            </Button>
          ) : null}
        </div>

        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            dropInputRef.current?.click()
          }
          className="mt-4 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:cursor-not-allowed disabled:opacity-50"
        >
          También puedes arrastrar los archivos aquí
        </button>

        <input
          ref={dropInputRef}
          hidden
          multiple
          type="file"
          accept=".pdf,.txt,.md,.csv,.docx,.xlsx,.pptx,.zip"
          onChange={(event) => {
            const selectedFiles = Array.from(
              event.target.files ?? [],
            );

            const containsZip =
              selectedFiles.some((file) =>
                file.name
                  .toLowerCase()
                  .endsWith(".zip"),
              );

            addFiles(
              containsZip ? "zip" : "files",
              selectedFiles,
            );

            event.target.value = "";
          }}
        />
      </div>
    );
  }

  const ModeIcon = getModeIcon(mode);

  return (
    <div className="min-h-[420px] rounded-2xl border border-border bg-background">
      <div className="flex flex-col gap-4 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-300">
            <ModeIcon className="h-5 w-5" />
          </div>

          <div className="min-w-0">
            <p className="font-semibold text-foreground">
              Documentación preparada
            </p>

            <p className="truncate text-xs text-muted-foreground">
              {files.length}{" "}
              {files.length === 1
                ? "documento"
                : "documentos"}{" "}
              mediante {getModeLabel(mode)}
              {foldersCount > 0
                ? ` · ${foldersCount} carpetas detectadas`
                : ""}
              {" · "}
              {formatFileSize(totalSize)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <KnowledgeUploadMenu
            disabled={disabled || isAnalyzing}
            onSelect={addFiles}
          />

          <button
            type="button"
            disabled={isAnalyzing}
            onClick={resetImport}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            Vaciar
          </button>
        </div>
      </div>

      <div className="max-h-[330px] overflow-y-auto p-4">
        <div className="space-y-2">
          {files.map((file) => (
            <div
              key={file.id}
              className="group flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 transition hover:bg-muted/30"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <FileText className="h-4 w-4" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {file.name}
                </p>

                <p className="truncate text-xs text-muted-foreground">
                  {file.relativePath}
                  {" · "}
                  {formatFileSize(file.size)}
                </p>
              </div>

              <button
                type="button"
                disabled={isAnalyzing}
                onClick={() =>
                  removeFile(file.id)
                }
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 focus:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
                aria-label={`Quitar ${file.name}`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-cyan-600" />

          <p className="max-w-2xl text-xs leading-5 text-muted-foreground">
            La IA propondrá carpetas y artículos. No se
            creará nada dentro de Knowledge hasta que
            revises y confirmes la propuesta.
          </p>
        </div>

        <Button
          type="button"
          disabled={
            disabled ||
            isAnalyzing ||
            files.length === 0
          }
          onClick={handleAnalyze}
          className="shrink-0 bg-cyan-600 text-white hover:bg-cyan-700"
        >
          <Sparkles className="mr-2 h-4 w-4" />
          {isAnalyzing
            ? "Analizando..."
            : "Analizar documentación"}
        </Button>
      </div>

      {error ? (
        <div className="border-t border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">
          {error}
        </div>
      ) : null}
    </div>
  );
}
