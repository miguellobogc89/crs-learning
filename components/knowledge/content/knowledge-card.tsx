// components/knowledge/content/knowledge-card.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Brain,
  Clock,
  FileText,
  Globe2,
  GraduationCap,
  Loader2,
  Lock,
  MoreHorizontal,
  Sparkles,
  Trash2,
} from "lucide-react";

import { deleteKnowledgeAction } from "@/app/actions/knowledge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
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
};

function formatRelativeDate(date: Date | string | null | undefined) {
  if (!date) {
    return "Sin actualizar";
  }

  const value = new Date(date).getTime();
  const diffMinutes = Math.max(
    1,
    Math.floor((Date.now() - value) / 60000),
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

function getContentSummary(knowledge: KnowledgeSource) {
  const summary = knowledge.summary?.trim();

  if (summary) {
    return summary;
  }

  const description = knowledge.description?.trim();

  if (description) {
    return description;
  }

  const content = knowledge.content?.trim();

  if (content) {
    return content;
  }

  return "Fuente de conocimiento pendiente de completar.";
}

function getTags(tags: unknown) {
  if (!Array.isArray(tags)) {
    return [];
  }

  return tags
    .filter((tag): tag is string => typeof tag === "string")
    .slice(0, 3);
}

export function KnowledgeCard({ knowledge }: Props) {
  const router = useRouter();

  const [processing, setProcessing] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();

  const tags = getTags(knowledge.tags);

  async function reprocess() {
    setProcessing(true);

    try {
      await fetch(`/api/knowledge/${knowledge.id}/analyze`, {
        method: "POST",
      });

      router.refresh();
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

        setDeleteError("No se ha podido eliminar el artículo");
      }
    });
  }

  return (
    <Card className="group border-border bg-card transition hover:-translate-y-0.5 hover:border-cyan-200 hover:shadow-sm">
      <CardContent className="flex h-full flex-col p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-lesson-soft text-lesson">
            <FileText className="h-5 w-5" strokeWidth={2.25} />
          </span>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                disabled={isDeleting}
                className="rounded-lg p-1 text-muted-foreground opacity-70 transition hover:bg-surface hover:text-foreground group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label={`Opciones de ${knowledge.title}`}
              >
                {isDeleting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <MoreHorizontal
                    className="h-5 w-5"
                    strokeWidth={2.25}
                  />
                )}
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                disabled={processing || isDeleting}
                onClick={reprocess}
              >
                {processing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Reprocesando...
                  </>
                ) : (
                  <>
                    <Brain className="mr-2 h-4 w-4" />
                    Reprocesar IA
                  </>
                )}
              </DropdownMenuItem>

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

        <div className="min-h-[154px] flex-1">
          <div className="mb-3 flex items-start justify-between gap-2">
            <KnowledgeTypeBadge
              type={knowledge.knowledge_type}
              confidence={knowledge.confidence}
            />

            {knowledge.visibility === "private" ? (
              <Lock className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Globe2 className="h-4 w-4 text-muted-foreground" />
            )}
          </div>

          <Link href={`/knowledge/${knowledge.id}`}>
            <h2 className="line-clamp-2 text-base font-semibold leading-6 text-foreground hover:text-lesson">
              {knowledge.title}
            </h2>
          </Link>

          <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">
            {getContentSummary(knowledge)}
          </p>

          {tags.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}

          {deleteError ? (
            <p className="mt-3 text-xs text-red-600">
              {deleteError}
            </p>
          ) : null}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            {formatRelativeDate(knowledge.updated_at)}
          </div>

          <div className="flex items-center justify-end gap-1.5 truncate">
            <GraduationCap className="h-3.5 w-3.5 shrink-0" />

            <span className="truncate">
              {knowledge.domain ??
                knowledge.level ??
                "Sin dominio"}
            </span>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <Button
            asChild
            className="h-9 flex-1 px-3 text-xs"
          >
            <Link href={`/knowledge/${knowledge.id}`}>
              Abrir
            </Link>
          </Button>

          <Button
            className="h-9 flex-1 px-3 text-xs"
            disabled
            variant="secondary"
          >
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            IA
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}