// components/knowledge/content/knowledge-card.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Brain,
  Clock,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  FileInput,
  FileText,
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
  deleteKnowledgeAction,
  updateKnowledgeAction,
} from "@/app/actions/knowledge";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";

import { KnowledgeTypeBadge } from "./knowledge-type-badge";

type KnowledgeSource = {
  id: string;
  title: string;
  description?: string | null;
  content?: string | null;
  summary?: string | null;
  language?: string | null;
  domain?: string | null;
  level?: string | null;
  tags?: unknown;
  status?: string | null;
  visibility?: string | null;
  updated_at?: Date | string | null;
  knowledge_type?: string | null;
  confidence?: number | null;
};

type Props = {
  knowledge: KnowledgeSource;
  onShare?: (knowledge: KnowledgeSource) => void;
};

function formatRelativeDate(
  date: Date | string | null | undefined,
) {
  if (!date) {
    return "Sin actualizar";
  }

  const timestamp = new Date(date).getTime();

  const diffMinutes = Math.max(
    1,
    Math.floor((Date.now() - timestamp) / 60000),
  );

  if (diffMinutes < 60) {
    return `Hace ${diffMinutes} min`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `Hace ${diffHours} h`;
  }

  const diffDays = Math.floor(diffHours / 24);

  if (diffDays < 30) {
    return `Hace ${diffDays} días`;
  }

  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

export function KnowledgeCard({ knowledge, onShare, }: Props) {
  const router = useRouter();

  const [processing, setProcessing] = useState(false);
  const [deleteError, setDeleteError] =
    useState<string | null>(null);

  const [isDeleting, startDeleteTransition] =
    useTransition();

    const [visibility, setVisibility] = useState(
  knowledge.visibility ?? "private",
);

const [isUpdatingVisibility, startVisibilityTransition] =
  useTransition();

  const articleUrl = `/knowledge/${knowledge.id}`;

  function handleOpenArticle() {
    if (isDeleting) {
      return;
    }

    router.push(articleUrl);
  }

  async function reprocess() {
    if (processing || isDeleting) {
      return;
    }

    setProcessing(true);

    try {
      const response = await fetch(
        `/api/knowledge/${knowledge.id}/analyze`,
        {
          method: "POST",
        },
      );

      if (!response.ok) {
        throw new Error(
          "No se ha podido reprocesar el artículo",
        );
      }

      router.refresh();
    } catch (caughtError) {
      if (caughtError instanceof Error) {
        setDeleteError(caughtError.message);
      } else {
        setDeleteError(
          "No se ha podido reprocesar el artículo",
        );
      }
    } finally {
      setProcessing(false);
    }
  }

  function handleDelete() {
    const confirmed = window.confirm(
      `¿Quieres eliminar el artículo "${knowledge.title}"?\n\nTambién se eliminarán sus archivos, análisis y datos asociados. Esta acción no se puede deshacer.`,
    );

    if (!confirmed) {
      return;
    }

    setDeleteError(null);

    startDeleteTransition(async () => {
      try {
        await deleteKnowledgeAction(knowledge.id);
        router.refresh();
      } catch (caughtError) {
        if (caughtError instanceof Error) {
          setDeleteError(caughtError.message);
          return;
        }

        setDeleteError(
          "No se ha podido eliminar el artículo",
        );
      }
    });
  }

  function handleVisibilityChange(nextVisibility: string) {
  if (
    nextVisibility === visibility ||
    isUpdatingVisibility
  ) {
    return;
  }

  const previousVisibility = visibility;

  setVisibility(nextVisibility);

  startVisibilityTransition(async () => {
    try {
      const formData = new FormData();

      formData.set("id", knowledge.id);
      formData.set("title", knowledge.title);
      formData.set(
        "description",
        knowledge.description ?? "",
      );
      formData.set("visibility", nextVisibility);
      formData.set(
        "knowledgeType",
        knowledge.knowledge_type ?? "unknown",
      );
      formData.set("content", knowledge.content ?? "");

      await updateKnowledgeAction(formData);
      router.refresh();
    } catch (error) {
      console.error(error);
      setVisibility(previousVisibility);
    }
  });
}

function handleShare() {
  onShare?.(knowledge);
}

  return (
    <Card
      className={[
        "group relative h-[300px] self-start overflow-hidden border-border bg-card transition",
        "cursor-pointer hover:border-cyan-200 hover:shadow-md",
      ].join(" ")}
      onClick={handleOpenArticle}
    >
      <CardContent className="flex h-full flex-col p-0">
        <div className="relative flex h-[190px] shrink-0 items-center justify-center bg-card px-6">
          <div
  className="absolute left-4 top-4 z-10 opacity-0 transition group-hover:opacity-100"
  onClick={(event) => event.stopPropagation()}
>
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button
        type="button"
        disabled={isUpdatingVisibility}
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md bg-background/90 text-muted-foreground shadow-sm transition hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        aria-label={`Visibilidad de ${knowledge.title}`}
      >
        {isUpdatingVisibility ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : visibility === "public" ? (
          <Globe2 className="h-4 w-4" />
        ) : (
          <Lock className="h-4 w-4" />
        )}
      </button>
    </DropdownMenuTrigger>

    <DropdownMenuContent
      align="start"
      side="bottom"
      sideOffset={6}
      className="w-56"
    >
      <DropdownMenuLabel>
        Visibilidad
      </DropdownMenuLabel>

      <DropdownMenuSeparator />

      <DropdownMenuRadioGroup
        value={visibility}
        onValueChange={handleVisibilityChange}
      >
        <DropdownMenuRadioItem value="private">
          <Lock className="mr-2 h-4 w-4" />
          Privado
        </DropdownMenuRadioItem>

        <DropdownMenuRadioItem value="public">
          <Globe2 className="mr-2 h-4 w-4" />
          Público
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>

      <DropdownMenuSeparator />

      <DropdownMenuItem
        disabled={!onShare}
        onClick={handleShare}
      >
        <UsersRound className="mr-2 h-4 w-4" />
        Compartir…
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</div>
          <div
            className="absolute right-4 top-4 z-10 opacity-0 transition group-hover:opacity-100"
            onClick={(event) => event.stopPropagation()}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  disabled={isDeleting}
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md bg-background/90 text-muted-foreground shadow-sm transition hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={`Opciones de ${knowledge.title}`}
                >
                  {isDeleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <MoreHorizontal className="h-5 w-5" />
                  )}
                </button>
              </DropdownMenuTrigger>

              <DropdownMenuContent
                align="start"
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

                <DropdownMenuItem
                  onClick={handleOpenArticle}
                >
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

                <DropdownMenuItem disabled>
                  <Link2 className="mr-2 h-4 w-4" />
                  Copiar enlace
                </DropdownMenuItem>

                <DropdownMenuItem disabled>
                  <Share2 className="mr-2 h-4 w-4" />
                  Compartir
                </DropdownMenuItem>

                <DropdownMenuItem disabled>
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Administrar permisos
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  disabled={processing || isDeleting}
                  onClick={reprocess}
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
                  onClick={handleDelete}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Eliminar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex h-[120px] w-[120px] items-center justify-center rounded-2xl bg-lesson-soft text-lesson transition-transform duration-200 group-hover:scale-[1.03]">
            <FileText
              className="h-16 w-16"
              strokeWidth={1.5}
            />
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col border-t border-border bg-card px-4 py-3.5">
          <Link
            href={articleUrl}
            onClick={(event) => event.stopPropagation()}
            className="min-w-0"
          >
            <h2 className="truncate text-sm font-semibold text-foreground hover:text-lesson">
              {knowledge.title}
            </h2>
          </Link>

<div className="mt-2">
  <KnowledgeTypeBadge
    type={knowledge.knowledge_type}
    confidence={knowledge.confidence}
  />
</div>

          <div className="mt-auto flex items-center justify-end pt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {formatRelativeDate(knowledge.updated_at)}
            </span>
          </div>

          {deleteError ? (
            <p className="mt-1 truncate text-xs text-red-600">
              {deleteError}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}