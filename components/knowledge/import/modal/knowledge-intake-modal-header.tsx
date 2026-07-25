// components/knowledge/intake/modal/knowledge-intake-modal-header.tsx

import { FolderOpen, Library, Sparkles } from "lucide-react";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { KnowledgeIntakeContext } from "./knowledge-intake-modal.types";

type Props = { context: KnowledgeIntakeContext };

function getContextCopy(context: KnowledgeIntakeContext) {
  switch (context.origin) {
    case "article":
      return {
        icon: Sparkles,
        title: "Incorporar documentación",
        description:
          "La IA evaluará si los documentos enriquecen este artículo o requieren otra ubicación.",
      };
    case "folder":
      return {
        icon: FolderOpen,
        title: "Incorporar documentación",
        description:
          "La carpeta actual será el destino preferente, pero la IA podrá proponer una estructura mejor.",
      };
    case "root":
      return {
        icon: Library,
        title: "Incorporar documentación",
        description:
          "La IA analizará el repositorio y propondrá la mejor forma de organizar el contenido.",
      };
  }
}

export function KnowledgeIntakeModalHeader({ context }: Props) {
  const copy = getContextCopy(context);
  const Icon = copy.icon;

  return (
    <DialogHeader className="border-b border-border px-6 py-5">
      <div className="flex items-start gap-3 pr-10">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-300">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <DialogTitle className="text-lg font-semibold">{copy.title}</DialogTitle>
          <DialogDescription className="mt-1 max-w-2xl leading-6">
            {copy.description}
          </DialogDescription>
        </div>
      </div>
    </DialogHeader>
  );
}
