// components/knowledge/intake/modal/knowledge-intake-modal-footer.tsx

"use client";

import {
  ArrowLeft,
  Loader2,
  Sparkles,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";

import type { KnowledgeIntakeModalStep } from "./knowledge-intake-modal.types";

type Props = {
  step: KnowledgeIntakeModalStep;
  fileCount: number;
  validFileCount: number;
  failedFileCount: number;
  isAnalyzing: boolean;
  isConfirming: boolean;
  onCancel: () => void;
  onBack: () => void;
  onAnalyze: () => void;
  onContinueAnalysis: () => void;
  onConfirm: () => void;
  onReset: () => void;
  onClose: () => void;
};

export function KnowledgeIntakeModalFooter({
  step,
  fileCount,
  validFileCount,
  failedFileCount,
  isAnalyzing,
  isConfirming,
  onCancel,
  onBack,
  onAnalyze,
  onContinueAnalysis,
  onConfirm,
  onReset,
  onClose,
}: Props) {
  if (step === "analyzing") {
    const analysisFinished =
      !isAnalyzing &&
      fileCount > 0 &&
      validFileCount + failedFileCount ===
        fileCount;

    const canGenerateProposal =
      analysisFinished &&
      validFileCount > 0;

    return (
      <footer className="shrink-0 border-t border-border bg-background px-6 py-4">
        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={isAnalyzing}
            onClick={onCancel}
            className="h-11 px-5"
          >
            Cancelar
          </Button>

          <Button
            type="button"
            disabled={!canGenerateProposal}
            onClick={
              onContinueAnalysis
            }
            className="h-11 bg-black px-5 text-white hover:bg-black/90 disabled:bg-black/40 disabled:text-white/70"
          >
            {isAnalyzing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}

            {isAnalyzing
              ? "Analizando documentos"
              : validFileCount === 0
                ? "No hay documentos válidos"
                : `Generar propuesta con ${validFileCount} ${
                    validFileCount === 1
                      ? "documento"
                      : "documentos"
                  }`}
          </Button>
        </div>
      </footer>
    );
  }

  if (step === "proposal") {
    return (
      <footer className="shrink-0 border-t border-border bg-background px-6 py-4">
        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            disabled={isConfirming}
            onClick={onBack}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver
          </Button>

          <Button
            type="button"
            disabled={isConfirming}
            onClick={onConfirm}
            className="h-11 bg-black px-5 text-white hover:bg-black/90"
          >
            {isConfirming ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}

            {isConfirming
              ? "Aplicando propuesta"
              : "Confirmar incorporación"}
          </Button>
        </div>
      </footer>
    );
  }

  if (step === "completed") {
    return (
      <footer className="shrink-0 border-t border-border bg-background px-6 py-4">
        <div className="flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
          >
            Cerrar
          </Button>

          <Button
            type="button"
            onClick={onReset}
            className="h-11 bg-black px-5 text-white hover:bg-black/90"
          >
            Incorporar más documentos
          </Button>
        </div>
      </footer>
    );
  }

  return (
    <footer className="shrink-0 border-t border-border bg-background px-6 py-4">
      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={isAnalyzing}
          onClick={onCancel}
          className="h-11 px-5"
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
          className="h-11 bg-black px-5 text-white hover:bg-black/90 disabled:bg-black/40 disabled:text-white/70"
        >
          {isAnalyzing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Upload className="mr-2 h-4 w-4" />
          )}

          Subir archivos
        </Button>
      </div>
    </footer>
  );
}