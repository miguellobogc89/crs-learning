// components/knowledge/detail/shared/knowledge-action-bar.tsx

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

  onEdit: () => void;
  onSave: () => void | Promise<void>;
  onCancel: () => void;
  onRebuild: () => void | Promise<void>;
  onDownload: () => void | Promise<void>;
};

const buttonClass =
  "inline-flex items-center gap-2 rounded-lg border border-border " +
  "px-3 py-2 text-sm font-medium transition-colors " +
  "hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";

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

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {isEditing ? (
        <>
          <button
            type="button"
            className={buttonClass}
            disabled={isSaving}
            onClick={onCancel}
          >
            <X className="h-4 w-4" />
            Cancelar
          </button>

          <button
            type="button"
            className={buttonClass}
            disabled={isBusy}
            onClick={onSave}
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
            className={buttonClass}
            disabled={isBusy}
            onClick={onRebuild}
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
            className={buttonClass}
            disabled={isBusy || !canEdit}
            onClick={onEdit}
          >
            <Pencil className="h-4 w-4" />
            Editar contenido
          </button>

          <button
            type="button"
            className={buttonClass}
            disabled={isBusy || !canDownload}
            onClick={onDownload}
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