// components/knowledge/content/cards/article/knowledge-card-menu.tsx
"use client";

import {
  Brain,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  FileInput,
  Globe2,
  Link2,
  Loader2,
  Lock,
  MoreHorizontal,
  Share2,
  ShieldCheck,
  Trash2,
  UsersRound,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { KnowledgeSource } from "./types";

type Props = {
  knowledge: KnowledgeSource;
  visibility: string;
  processing: boolean;
  isDeleting: boolean;
  isUpdatingVisibility: boolean;
  onOpen: () => void;
  onReprocess: () => void;
  onDelete: () => void;
  onVisibilityChange: (visibility: string) => void;
  onShare?: (knowledge: KnowledgeSource) => void;
};

export function KnowledgeCardMenu({
  knowledge,
  visibility,
  processing,
  isDeleting,
  isUpdatingVisibility,
  onOpen,
  onReprocess,
  onDelete,
  onVisibilityChange,
  onShare,
}: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={isDeleting}
          aria-label={`Opciones de ${knowledge.title}`}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border/80 bg-background/95 text-muted-foreground shadow-sm transition hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isDeleting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MoreHorizontal className="h-4.5 w-4.5" />
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        side="bottom"
        sideOffset={6}
        className="w-64"
      >
        <DropdownMenuLabel className="px-3 py-2.5">
          <p className="truncate text-sm font-semibold text-foreground">
            {knowledge.title}
          </p>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={onOpen}>
          <ExternalLink className="mr-2 h-4 w-4" />
          Abrir
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem disabled>
          <Edit3 className="mr-2 h-4 w-4" />
          Renombrar
        </DropdownMenuItem>

        <DropdownMenuItem disabled>
          <FileInput className="mr-2 h-4 w-4" />
          Mover
        </DropdownMenuItem>

        <DropdownMenuItem disabled>
          <Copy className="mr-2 h-4 w-4" />
          Copiar
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Visibilidad
        </DropdownMenuLabel>

        <DropdownMenuRadioGroup
          value={visibility}
          onValueChange={onVisibilityChange}
        >
          <DropdownMenuRadioItem
            value="private"
            disabled={isUpdatingVisibility}
          >
            <Lock className="mr-2 h-4 w-4" />
            Privado
          </DropdownMenuRadioItem>

          <DropdownMenuRadioItem
            value="public"
            disabled={isUpdatingVisibility}
          >
            <Globe2 className="mr-2 h-4 w-4" />
            Público
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />

        <DropdownMenuItem disabled>
          <Link2 className="mr-2 h-4 w-4" />
          Copiar enlace
        </DropdownMenuItem>

        <DropdownMenuItem
          disabled={!onShare}
          onClick={() => onShare?.(knowledge)}
        >
          <UsersRound className="mr-2 h-4 w-4" />
          Compartir
        </DropdownMenuItem>

        <DropdownMenuItem disabled>
          <ShieldCheck className="mr-2 h-4 w-4" />
          Administrar permisos
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          disabled={processing || isDeleting}
          onClick={onReprocess}
        >
          {processing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Brain className="mr-2 h-4 w-4" />
          )}

          {processing
            ? "Reprocesando..."
            : "Reprocesar IA"}
        </DropdownMenuItem>

        <DropdownMenuItem disabled>
          <Download className="mr-2 h-4 w-4" />
          Descargar
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          className="text-red-600 focus:text-red-600"
          disabled={isDeleting}
          onClick={onDelete}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Eliminar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}