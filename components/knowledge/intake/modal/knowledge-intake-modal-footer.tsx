// components/knowledge/intake/modal/knowledge-intake-modal-footer.tsx

import {
  ArrowLeft,
  Loader2,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";

import type { KnowledgeIntakeModalStep } from "./knowledge-intake-modal.types";

type Props = {
  step: KnowledgeIntakeModalStep;
  fileCount: number;
  isAnalyzing: boolean;
  isConfirming: boolean;
  onCancel: () => void;
  onBack: () => void;
  onAnalyze: () => void;
  onConfirm: () => void;
  onReset: () => void;
  onClose: () => void;
};

export function KnowledgeIntakeModalFooter({
  step,
  fileCount,
  isAnalyzing,
  isConfirming,
  onCancel,
  onBack,
  onAnalyze,
  onConfirm,
  onReset,
  onClose,
}: Props) {
  if (step === "analyzing") {
    return (
      <div className="flex justify-end border-t border-border bg-muted/20 px-6 py-4">
        <Button
          type="button"
          disabled
        >
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Analizando documentación
        </Button>
      </div>
    );
  }

  if (step === "proposal") {
    return (
      <div className="flex flex-wrap justify-between gap-3 border-t border-border bg-muted/20 px-6 py-4">
        <Button
          type="button"
          variant="outline"
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
          className="bg-cyan-600 text-white hover:bg-cyan-700"
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
    );
  }

  if (step === "completed") {
    return (
      <div className="flex flex-wrap justify-end gap-3 border-t border-border bg-muted/20 px-6 py-4">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
        >
          Cerrar
        </Button>

        <Button
          type="button"
          onClick={onReset}
          className="bg-cyan-600 text-white hover:bg-cyan-700"
        >
          Incorporar más documentos
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap justify-end gap-3 border-t border-border bg-muted/20 px-6 py-4">
      <Button
        type="button"
        variant="outline"
        disabled={isAnalyzing}
        onClick={onCancel}
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
        className="bg-cyan-600 text-white hover:bg-cyan-700"
      >
        {isAnalyzing ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="mr-2 h-4 w-4" />
        )}

        Analizar antes de incorporar
      </Button>
    </div>
  );
}