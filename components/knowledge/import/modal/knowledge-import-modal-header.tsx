// components/knowledge/import/modal/knowledge-import-modal-header.tsx

import {
  FolderOpen,
  Library,
  Sparkles,
} from "lucide-react";

import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { KnowledgeImportContext } from "./knowledge-import-modal.types";

type Props = {
  context: KnowledgeImportContext;
};

function getContextCopy(
  context: KnowledgeImportContext,
) {
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

export function KnowledgeImportModalHeader({
  context,
}: Props) {
  const copy =
    getContextCopy(context);

  const Icon = copy.icon;

  return (
    <DialogHeader className="shrink-0 border-b border-slate-100 bg-white px-7 py-5">
      <div className="flex items-center gap-4 pr-10">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#E8F1FF] text-[#0A58FF]">
          <Icon
            className="size-5"
            strokeWidth={2.15}
          />
        </div>

        <div className="min-w-0">
          <DialogTitle className="text-[19px] font-semibold tracking-[-0.02em] text-slate-950">
            {copy.title}
          </DialogTitle>

          <DialogDescription className="mt-1 max-w-3xl text-[13px] leading-5 text-slate-500">
            {copy.description}
          </DialogDescription>
        </div>
      </div>
    </DialogHeader>
  );
}