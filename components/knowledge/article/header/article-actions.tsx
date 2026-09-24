
// components/knowledge/article/header/article-actions.tsx

"use client";

import {
  Copy,
  Download,
  Edit3,
  Settings,
  Share2,
  Trash2,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ArticleActionsProps = {
  knowledgeType: string;
  visibility: string;
  isEditingContent: boolean;
  isUpdating: boolean;
  onEditContent: () => void;
  onShare: () => void;
};

const TYPE_LABELS: Record<string, string> = {
  procedure: "Procedimiento",
  process: "Proceso",
  policy: "Política",
  manual: "Manual",
  guide: "Guía",
  faq: "FAQ",
  technical: "Técnico",
  functional: "Funcional",
  unknown: "Sin clasificar",
};

const VISIBILITY_LABELS: Record<string, string> = {
  private: "Privado",
  shared: "Compartido",
  public: "Público",
};

export function ArticleActions({
  knowledgeType,
  visibility,
  isEditingContent,
  isUpdating,
  onEditContent,
  onShare,
}: ArticleActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Abrir acciones del artículo"
          title="Acciones del artículo"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-blue-50 hover:text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500 data-[state=open]:bg-blue-50 data-[state=open]:text-blue-600 dark:hover:bg-blue-950/40 dark:hover:text-blue-400"
        >
          <Settings className="h-5 w-5" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="space-y-1 font-normal">
          <p className="text-xs text-muted-foreground">
            Tipo
          </p>

          <p className="text-sm font-medium text-foreground">
            {TYPE_LABELS[knowledgeType] ?? "Sin clasificar"}
          </p>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuLabel className="space-y-1 font-normal">
          <p className="text-xs text-muted-foreground">
            Visibilidad
          </p>

          <p className="text-sm font-medium text-foreground">
            {VISIBILITY_LABELS[visibility] ?? "Privado"}
          </p>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          disabled={isEditingContent || isUpdating}
          onClick={onEditContent}
        >
          <Edit3 className="mr-2 h-4 w-4" />
          Editar contenido
        </DropdownMenuItem>

        <DropdownMenuItem onClick={onShare}>
          <Share2 className="mr-2 h-4 w-4" />
          Compartir
        </DropdownMenuItem>

        <DropdownMenuItem disabled>
          <Download className="mr-2 h-4 w-4" />
          Descargar
        </DropdownMenuItem>

        <DropdownMenuItem disabled>
          <Copy className="mr-2 h-4 w-4" />
          Copiar enlace
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          disabled
          className="text-destructive"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Eliminar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}