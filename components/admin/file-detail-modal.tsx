"use client";

import { X } from "lucide-react";
import type { StorageFileWithDetails } from "@/lib/repositories/admin/storage.repository";

interface FileDetailModalProps {
  file: StorageFileWithDetails;
  onClose: () => void;
}

export function FileDetailModal({ file, onClose }: FileDetailModalProps) {
  const formatBytes = (bytes: number | null): string => {
    if (!bytes) return "—";
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(2) + " " + sizes[i];
  };

  const formatDate = (date: Date): string => {
    return new Date(date).toLocaleDateString("es-ES", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case "uploaded":
        return "text-blue-600";
      case "processing":
        return "text-yellow-600";
      case "completed":
        return "text-green-600";
      case "failed":
        return "text-red-600";
      default:
        return "text-gray-600";
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-lg shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between p-4 border-b border-border bg-surface">
          <h2 className="text-lg font-semibold text-foreground">
            Detalles del archivo
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Información del archivo */}
          <section>
            <h3 className="text-sm font-semibold text-foreground mb-3 uppercase tracking-wider text-muted-foreground">
              Archivo
            </h3>
            <div className="space-y-2 bg-surface rounded-lg p-4">
              <div className="flex justify-between items-start gap-2">
                <span className="text-sm text-muted-foreground">Nombre:</span>
                <span className="text-sm font-medium text-foreground text-right">
                  {file.fileName}
                </span>
              </div>
              <div className="flex justify-between items-start gap-2">
                <span className="text-sm text-muted-foreground">Tamaño:</span>
                <span className="text-sm font-medium text-foreground">
                  {formatBytes(file.fileSize)} ({file.fileSizeGB} GB)
                </span>
              </div>
              <div className="flex justify-between items-start gap-2">
                <span className="text-sm text-muted-foreground">Tipo MIME:</span>
                <span className="text-sm font-medium text-foreground">
                  {file.fileType || "—"}
                </span>
              </div>
              <div className="flex justify-between items-start gap-2">
                <span className="text-sm text-muted-foreground">
                  Subido por:
                </span>
                <div className="text-right">
                  <div className="text-sm font-medium text-foreground">
                    {file.uploadedByUser?.name || "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {file.uploadedByUser?.email}
                  </div>
                </div>
              </div>
              <div className="flex justify-between items-start gap-2">
                <span className="text-sm text-muted-foreground">Fecha:</span>
                <span className="text-sm font-medium text-foreground">
                  {formatDate(file.createdAt)}
                </span>
              </div>
            </div>
          </section>

          {/* Ubicación */}
          <section>
            <h3 className="text-sm font-semibold text-foreground mb-3 uppercase tracking-wider text-muted-foreground">
              Ubicación
            </h3>
            <div className="space-y-2 bg-surface rounded-lg p-4">
              <div className="flex justify-between items-start gap-2">
                <span className="text-sm text-muted-foreground">Workspace:</span>
                <span className="text-sm font-medium text-foreground">
                  {file.library?.workspace?.name || "—"}
                </span>
              </div>
              <div className="flex justify-between items-start gap-2">
                <span className="text-sm text-muted-foreground">Biblioteca:</span>
                <span className="text-sm font-medium text-foreground">
                  {file.library?.name || "—"}
                </span>
              </div>
              <div className="flex justify-between items-start gap-2">
                <span className="text-sm text-muted-foreground">
                  Knowledge Source:
                </span>
                <div className="text-right">
                  <div className="text-sm font-medium text-foreground">
                    {file.knowledgeSource.title}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Estado: {file.knowledgeSource.status}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Procesamiento */}
          <section>
            <h3 className="text-sm font-semibold text-foreground mb-3 uppercase tracking-wider text-muted-foreground">
              Procesamiento
            </h3>
            <div className="space-y-2 bg-surface rounded-lg p-4">
              <div className="flex justify-between items-start gap-2">
                <span className="text-sm text-muted-foreground">
                  Estado del archivo:
                </span>
                <span className="text-sm font-medium text-foreground">
                  {file.status}
                </span>
              </div>

              {file.analysis ? (
                <>
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-sm text-muted-foreground">
                      Estado de análisis:
                    </span>
                    <span className={`text-sm font-medium ${getStatusColor(file.analysis.status)}`}>
                      {file.analysis.status}
                    </span>
                  </div>
                  {file.analysis.tokensInput !== null && (
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-sm text-muted-foreground">
                        Tokens procesados:
                      </span>
                      <span className="text-sm font-medium text-foreground">
                        {file.analysis.tokensInput.toLocaleString()} entrada,{" "}
                        {file.analysis.tokensOutput?.toLocaleString() || "0"} salida
                      </span>
                    </div>
                  )}
                  {file.analysis.errorMessage && (
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-sm text-muted-foreground">
                        Último error:
                      </span>
                      <span className="text-sm font-medium text-red-600 text-right max-w-xs">
                        {file.analysis.errorMessage}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-sm text-muted-foreground italic">
                  Sin análisis disponible
                </div>
              )}
            </div>
          </section>

          {/* Nota sobre datos faltantes */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-xs text-blue-900">
              <strong>Nota:</strong> Algunos datos adicionales como número de chunks/embeddings
              no están disponibles en el esquema actual. Se recomienda agregar campos para
              registrar análisis más detallados del procesamiento.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 border-t border-border bg-surface p-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-foreground bg-surface border border-border rounded-md hover:bg-background transition"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
