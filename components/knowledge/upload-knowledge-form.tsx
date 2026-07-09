// components/knowledge/upload-knowledge-form.tsx
"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";

import { uploadKnowledgeFileAction } from "@/app/actions/knowledge";
import { Button } from "@/components/ui/button";
import { UploadZone } from "@/components/knowledge/upload-zone";

type Props = {
  knowledgeId: string;
};

const processingSteps = [
  "Archivos recibidos",
  "Texto extraído",
  "Documento clasificado",
  "Resumen generado",
  "FAQ y conceptos generados",
  "Knowledge actualizado",
];

export function UploadKnowledgeForm({ knowledgeId }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [isPending, startTransition] = useTransition();
  const hasFiles = files.length > 0;

  function handleSubmit(formData: FormData) {
    if (!hasFiles || isPending) {
      return;
    }

    startTransition(async () => {
      await uploadKnowledgeFileAction(formData);
    });
  }

  return (
    <form action={handleSubmit}>
      <input type="hidden" name="knowledgeId" value={knowledgeId} />

      <UploadZone
        accept=".pdf,.txt,.md,.csv,.docx,.xlsx,.pptx"
        disabled={isPending}
        onFilesChange={setFiles}
      />

      {isPending && (
        <div className="mt-5 rounded-xl border border-border bg-background p-4">
          <div className="mb-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">
                Procesando documentos
              </span>
              <span className="text-muted-foreground">
                Puede tardar unos segundos
              </span>
            </div>

            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full w-3/4 animate-pulse rounded-full bg-primary" />
            </div>
          </div>

          <div className="space-y-2">
            {processingSteps.map((step, index) => {
              const isActive = index === 2;

              return (
                <div
                  key={step}
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                >
                  {index < 2 ? (
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  ) : isActive ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  ) : (
                    <Circle className="h-4 w-4" />
                  )}

                  <span>{step}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!isPending && hasFiles && (
        <div className="mt-4 rounded-lg border border-border bg-surface/40 px-3 py-2 text-xs text-muted-foreground">
          {files.length === 1
            ? "1 documento listo para procesar."
            : `${files.length} documentos listos para procesar.`}
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <Button type="submit" disabled={!hasFiles || isPending}>
          {isPending ? "Procesando..." : "Iniciar procesamiento"}
        </Button>
      </div>
    </form>
  );
}