// components/knowledge/import/modal/knowledge-import-modal-footer.tsx

"use client";

import {
  ArrowLeft,
  Loader2,
  Minimize2,
  Sparkles,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";

import type { KnowledgeImportModalStep } from "./knowledge-import-modal.types";

type Props = {
  allFilesDuplicate?: boolean;
  step: KnowledgeImportModalStep;
  fileCount: number;
  validFileCount: number;
  duplicateFileCount: number;
  failedFileCount: number;
  isAnalyzing: boolean;
  isConfirming: boolean;
  canContinue: boolean;
  canContinueInBackground: boolean;
  onCancel: () => void;
  onBack: () => void;
  onAnalyze: () => void;
  onContinueAnalysis: () => void;
  onContinueInBackground: () => void;
  onConfirm: () => void;
  onClose: () => void;
};

const primaryButtonClassName =
  "h-10 rounded-xl border-0 bg-[#0A58FF] px-5 text-[12px] font-semibold text-white shadow-none hover:bg-[#084BD8] disabled:bg-slate-200 disabled:text-slate-400";

const secondaryButtonClassName =
  "h-10 rounded-xl border border-slate-200 bg-white px-4 text-[12px] font-medium text-slate-700 shadow-none hover:bg-slate-50 hover:text-slate-950";

export function KnowledgeImportModalFooter({
  allFilesDuplicate = false,
  step,
  fileCount,
  validFileCount,
  duplicateFileCount,
  failedFileCount,
  isAnalyzing,
  isConfirming,
  canContinue,
  canContinueInBackground,
  onCancel,
  onBack,
  onAnalyze,
  onContinueAnalysis,
  onContinueInBackground,
  onConfirm,
  onClose,
}: Props) {
  if (allFilesDuplicate) {
    return (
      <footer className="flex shrink-0 justify-end border-t border-slate-100 bg-white px-7 py-4">
        <Button
          type="button"
          onClick={onCancel}
          className={primaryButtonClassName}
        >
          Cerrar
        </Button>
      </footer>
    );
  }

  if (step === "analyzing") {
    return (
      <footer className="shrink-0 border-t border-slate-100 bg-white px-7 py-4">
        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={isAnalyzing}
            onClick={onCancel}
            className={secondaryButtonClassName}
          >
            Cancelar
          </Button>

          <div className="flex items-center gap-2">
            {canContinueInBackground ? (
              <Button
                type="button"
                variant="outline"
                onClick={
                  onContinueInBackground
                }
                className={secondaryButtonClassName}
              >
                <Minimize2 className="mr-2 size-3.5" />
                Continuar en segundo plano
              </Button>
            ) : null}

            <Button
              type="button"
              disabled={!canContinue}
              onClick={
                onContinueAnalysis
              }
              className={primaryButtonClassName}
            >
              {isAnalyzing ? (
                <Loader2 className="mr-2 size-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-2 size-3.5" />
              )}

              {isAnalyzing
                ? "Analizando documentos"
                : validFileCount === 0
                  ? "No hay documentos válidos"
                  : `Generar propuesta con ${validFileCount} ${
                      validFileCount ===
                      1
                        ? "documento"
                        : "documentos"
                    }`}
            </Button>
          </div>
        </div>
      </footer>
    );
  }

  if (step === "proposal") {
    return (
      <footer className="shrink-0 border-t border-slate-100 bg-white px-7 py-4">
        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            disabled={isConfirming}
            onClick={onBack}
            className="h-10 rounded-xl px-3 text-[12px] font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-950"
          >
            <ArrowLeft className="mr-2 size-3.5" />
            Volver
          </Button>

          <div className="flex items-center gap-2">
            {canContinueInBackground ? (
              <Button
                type="button"
                variant="outline"
                disabled={
                  !canContinueInBackground
                }
                onClick={
                  onContinueInBackground
                }
                className={secondaryButtonClassName}
              >
                <Minimize2 className="mr-2 size-3.5" />
                Continuar en segundo plano
              </Button>
            ) : null}

            <Button
              type="button"
              disabled={isConfirming}
              onClick={onConfirm}
              className={primaryButtonClassName}
            >
              {isConfirming ? (
                <Loader2 className="mr-2 size-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-2 size-3.5" />
              )}

              {isConfirming
                ? "Aplicando propuesta"
                : "Confirmar incorporación"}
            </Button>
          </div>
        </div>
      </footer>
    );
  }

  if (step === "completed") {
    return (
      <footer className="shrink-0 border-t border-slate-100 bg-white px-7 py-4">
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={onClose}
            className={primaryButtonClassName}
          >
            Finalizar
          </Button>
        </div>
      </footer>
    );
  }

  return (
    <footer className="shrink-0 border-t border-slate-100 bg-white px-7 py-4">
      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={isAnalyzing}
          onClick={onCancel}
          className={secondaryButtonClassName}
        >
          Cancelar
        </Button>

        <Button
          type="button"
          disabled={
            isAnalyzing ||
            fileCount === 0
          }
          onClick={onAnalyze}
          className={primaryButtonClassName}
        >
          {isAnalyzing ? (
            <Loader2 className="mr-2 size-3.5 animate-spin" />
          ) : (
            <Upload className="mr-2 size-3.5" />
          )}

          Subir archivos
        </Button>
      </div>
    </footer>
  );
}