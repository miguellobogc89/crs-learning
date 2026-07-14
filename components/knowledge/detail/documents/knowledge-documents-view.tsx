// components/knowledge/detail/documents/knowledge-documents-view.tsx

import {
  AlertTriangle,
  CheckCircle2,
  FileSearch,
  Loader2,
  RefreshCw,
  Upload,
} from "lucide-react";

import { KnowledgeFileCard } from "@/components/knowledge/knowledge-item/knowledge-file-card";
import { UploadKnowledgeForm } from "@/components/knowledge/upload-knowledge-form";
import { Button } from "@/components/ui/button";

import type { KnowledgeFile } from "../knowledge-detail.types";

type Props = {
  knowledgeId: string;
  uploadFormId: string;

  files: KnowledgeFile[];

  showUpload: boolean;
  uploadableFileCount: number;

  articleNeedsRebuild: boolean;
  isRebuilding: boolean;

  rebuildError: string | null;

  getContributionPercentage: (
    knowledgeFileId: string,
  ) => number | null;

  onShowUpload: () => void;
  onCloseUpload: () => void;
  onRebuild: () => void;

  onUploadableFileCountChange: (
    count: number,
  ) => void;
};

export function KnowledgeDocumentsView({
  knowledgeId,
  uploadFormId,
  files,
  showUpload,
  uploadableFileCount,
  articleNeedsRebuild,
  isRebuilding,
  rebuildError,
  getContributionPercentage,
  onShowUpload,
  onCloseUpload,
  onRebuild,
  onUploadableFileCountChange,
}: Props) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="text-lg font-semibold text-foreground">
              Documentos fuente
            </h2>

            {articleNeedsRebuild ? (
              <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" />

                <span>
                  Cambios pendientes de actualizar
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />

                <span>Actualizado</span>
              </div>
            )}
          </div>

          <p className="mt-1 text-sm text-muted-foreground">
            Evidencias utilizadas para construir y
            analizar este artículo.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">
          {showUpload ? (
            <>
              {uploadableFileCount > 0 ? (
                <div className="inline-flex h-11 items-center gap-2.5 rounded-xl border border-cyan-200 bg-cyan-50/60 px-3 dark:border-cyan-900 dark:bg-cyan-950/20">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300">
                    <FileSearch className="h-3.5 w-3.5" />
                  </div>

                  <div className="leading-tight">
                    <p className="text-xs font-medium text-foreground">
                      Documentación preparada
                    </p>

                    <p className="text-[11px] text-muted-foreground">
                      {uploadableFileCount === 1
                        ? "1 documento listo para subir."
                        : `${uploadableFileCount} documentos listos para subir.`}
                    </p>
                  </div>
                </div>
              ) : null}

              <Button
                type="button"
                variant="outline"
                disabled={isRebuilding}
                onClick={onCloseUpload}
                className="h-11 px-5"
              >
                Cancelar
              </Button>

              {uploadableFileCount > 0 ? (
                <Button
                  type="submit"
                  form={uploadFormId}
                  className="h-11 bg-black px-6 text-white hover:bg-black/85"
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Subir
                </Button>
              ) : null}
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={isRebuilding}
                onClick={onShowUpload}
                className="h-11 px-5"
              >
                Añadir documentos
              </Button>

              {articleNeedsRebuild ? (
                <Button
                  type="button"
                  onClick={onRebuild}
                  disabled={isRebuilding}
                  className="h-11 bg-black px-5 text-white hover:bg-black/85"
                >
                  {isRebuilding ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}

                  {isRebuilding
                    ? "Actualizando..."
                    : "Actualizar conocimiento"}
                </Button>
              ) : null}
            </>
          )}
        </div>
      </div>

      {rebuildError ? (
        <p className="mb-6 text-sm text-red-600">
          {rebuildError}
        </p>
      ) : null}

      {showUpload ? (
        <div className="mb-6 rounded-xl border border-border bg-background p-5">
          <UploadKnowledgeForm
            formId={uploadFormId}
            knowledgeId={knowledgeId}
            existingFiles={files.map((file) => ({
              fileName: file.file_name,
              fileSize: file.file_size,
            }))}
            onUploadableFileCountChange={
              onUploadableFileCountChange
            }
          />
        </div>
      ) : null}

      {files.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {files.map((file) => (
            <KnowledgeFileCard
              key={file.id}
              file={file}
              contributionPercentage={getContributionPercentage(
                file.id,
              )}
            />
          ))}
        </div>
      ) : (
        <div className="flex min-h-[240px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-background px-6 py-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600 dark:bg-cyan-950/30 dark:text-cyan-300">
            <Upload className="h-5 w-5" />
          </div>

          <h3 className="mt-4 text-base font-semibold text-foreground">
            No hay documentos vinculados
          </h3>

          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            Añade documentación para construir el artículo y
            generar automáticamente su análisis.
          </p>

          {!showUpload ? (
            <Button
              type="button"
              onClick={onShowUpload}
              className="mt-6 h-10 bg-black px-5 text-white hover:bg-black/85"
            >
              <Upload className="mr-2 h-4 w-4" />
              Añadir documentos
            </Button>
          ) : null}
        </div>
      )}
    </section>
  );
}