// components/knowledge/intake/modal/knowledge-intake-completed-step.tsx

import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ConfirmKnowledgeIntakeResult } from "@/lib/knowledge/intake/types";

type Props = {
  result: ConfirmKnowledgeIntakeResult;
  onReset: () => void;
  onClose: () => void;
};

export function KnowledgeIntakeCompletedStep({ result, onReset, onClose }: Props) {
  return (
    <div className="flex items-center justify-center py-6">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-background p-6 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h3 className="mt-4 text-lg font-semibold text-foreground">Incorporación completada</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">La documentación se ha incorporado y los artículos afectados se han actualizado.</p>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-border bg-muted/20 p-3"><p className="text-xl font-semibold text-foreground">{result.summary.createdArticles}</p><p className="text-[11px] text-muted-foreground">Creados</p></div>
          <div className="rounded-lg border border-border bg-muted/20 p-3"><p className="text-xl font-semibold text-foreground">{result.summary.updatedArticles}</p><p className="text-[11px] text-muted-foreground">Actualizados</p></div>
          <div className="rounded-lg border border-border bg-muted/20 p-3"><p className="text-xl font-semibold text-foreground">{result.summary.ignoredDocuments}</p><p className="text-[11px] text-muted-foreground">Omitidos</p></div>
        </div>

        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Button type="button" variant="outline" onClick={onClose}>Cerrar</Button>
          <Button type="button" onClick={onReset} className="bg-cyan-600 text-white hover:bg-cyan-700">Incorporar más documentos</Button>
        </div>
      </div>
    </div>
  );
}
