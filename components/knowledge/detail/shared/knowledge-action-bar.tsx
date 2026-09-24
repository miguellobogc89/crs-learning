
// components/knowledge/details/shared/knowledge-action-bar.tsx

"use client";

import {
  Download,
  Loader2,
  Pencil,
  RefreshCw,
  Save,
  X,
} from "lucide-react";

type KnowledgeActionBarProps = {
  isEditing?: boolean;
  isSaving?: boolean;
  isRebuilding?: boolean;
  isDownloading?: boolean;

  canEdit?: boolean;
  canDownload?: boolean;

  onEdit?: () => void;
  onSave?: () => void;
  onCancel?: () => void;
  onRebuild?: () => void;
  onDownload?: () => void;
};

export function KnowledgeActionBar({
  isEditing = false,
  isSaving = false,
  isRebuilding = false,
  isDownloading = false,
  canEdit = true,
  canDownload = true,
  onEdit,
  onSave,
  onCancel,
  onRebuild,
  onDownload,
}: KnowledgeActionBarProps) {
  const isBusy = isSaving || isRebuilding || isDownloading;

  const buttonClassName =
    "inline-flex h-9 items-center justify-center gap-2 rounded-lg " +
    "border border-border bg-background px-3 text-sm font-medium " +
    "transition-colors hover:bg-muted " +
    "disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="flex w-full flex-wrap items-center justify-end gap-2">
      {isEditing ? (
        <>
          <button
            type="button"
            className={buttonClassName}
            onClick={onCancel}
            disabled={isBusy || !onCancel}
          >
            <X className="h-4 w-4" />
            Cancelar
          </button>

          <button
            type="button"
            className={buttonClassName}
            onClick={onSave}
            disabled={isBusy || !onSave}
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isSaving ? "Guardando..." : "Guardar"}
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            className={buttonClassName}
            onClick={onRebuild}
            disabled={isBusy || !onRebuild}
          >
            {isRebuilding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {isRebuilding ? "Reconstruyendo..." : "Reconstruir"}
          </button>

          <button
            type="button"
            className={buttonClassName}
            onClick={onEdit}
            disabled={isBusy || !canEdit || !onEdit}
          >
            <Pencil className="h-4 w-4" />
            Editar contenido
          </button>

          <button
            type="button"
            className={buttonClassName}
            onClick={onDownload}
            disabled={isBusy || !canDownload || !onDownload}
          >
            {isDownloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {isDownloading ? "Descargando..." : "Descargar PDF"}
          </button>
        </>
      )}
    </div>
  );
}