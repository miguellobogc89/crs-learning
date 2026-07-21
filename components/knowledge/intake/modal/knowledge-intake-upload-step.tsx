// components/knowledge/intake/modal/knowledge-intake-upload-step.tsx

import { Sparkles } from "lucide-react";
import { UploadZone } from "@/components/knowledge/upload-zone";
import { Button } from "@/components/ui/button";

const ACCEPTED_FILE_TYPES = [".pdf", ".docx", ".xlsx", ".pptx", ".csv", ".txt"].join(",");

type Props = {
  files: File[];
  isAnalyzing: boolean;
  error: string | null;
  onFilesChange: (files: File[]) => void;
  onAnalyze: () => void;
};

export function KnowledgeIntakeUploadStep({ files, isAnalyzing, error, onFilesChange, onAnalyze }: Props) {
  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-border bg-muted/20 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-200 bg-cyan-50 text-cyan-700">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Incorporación inteligente</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Se comprobarán duplicados, versiones, artículos relacionados y la mejor estructura antes de modificar el repositorio.
            </p>
          </div>
        </div>
      </div>

      <UploadZone
        accept={ACCEPTED_FILE_TYPES}
        files={files}
        disabled={isAnalyzing}
        uploadingFileNames={isAnalyzing ? files.map((file) => file.name) : []}
        onFilesChange={onFilesChange}
      />

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      <div className="flex justify-end">
        <Button type="button" disabled={isAnalyzing || files.length === 0} onClick={onAnalyze} className="bg-cyan-600 text-white hover:bg-cyan-700">
          <Sparkles className="mr-2 h-4 w-4" />
          Analizar antes de incorporar
        </Button>
      </div>
    </div>
  );
}
