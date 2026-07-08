// components/knowledge/content/knowledge-card.tsx
import Link from "next/link";
import {
  Clock,
  FileText,
  Globe2,
  GraduationCap,
  Lock,
  MoreHorizontal,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type KnowledgeSource = {
  id: string;
  title: string;
  description?: string | null;
  content?: string | null;
  status?: string | null;
  visibility?: string | null;
  updated_at?: Date | string | null;
};

type Props = {
  knowledge: KnowledgeSource;
};

function formatRelativeDate(date: Date | string | null | undefined) {
  if (!date) return "Sin actualizar";

  const value = new Date(date).getTime();
  const diffMinutes = Math.max(1, Math.floor((Date.now() - value) / 60000));

  if (diffMinutes < 60) return `Hace ${diffMinutes} min`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `Hace ${diffHours} h`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `Hace ${diffDays} días`;

  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

function getStatusLabel(status: string | null | undefined) {
  if (status === "processed") return "IA procesada";
  if (status === "processing") return "Procesando";
  if (status === "error") return "Error";

  return "Borrador";
}

function getStatusClassName(status: string | null | undefined) {
  if (status === "processed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "processing") {
    return "border-cyan-200 bg-cyan-50 text-cyan-700";
  }

  if (status === "error") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  return "border-border bg-surface text-muted-foreground";
}

function getContentSummary(knowledge: KnowledgeSource) {
  const description = knowledge.description?.trim();

  if (description) return description;

  const content = knowledge.content?.trim();

  if (content) return content;

  return "Fuente de conocimiento pendiente de completar.";
}

export function KnowledgeCard({ knowledge }: Props) {
  return (
    <Card className="group border-border bg-card transition hover:-translate-y-0.5 hover:border-cyan-200 hover:shadow-sm">
      <CardContent className="flex h-full flex-col p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-lesson-soft text-lesson">
            <FileText className="h-5 w-5" />
          </span>

          <button
            className="rounded-lg p-1 text-muted-foreground opacity-70 transition hover:bg-surface hover:text-foreground group-hover:opacity-100"
            type="button"
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-[124px] flex-1">
          <div className="mb-2 flex items-center gap-2">
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${getStatusClassName(
                knowledge.status,
              )}`}
            >
              {getStatusLabel(knowledge.status)}
            </span>

            {knowledge.visibility === "private" ? (
              <Lock className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <Globe2 className="h-3.5 w-3.5 text-muted-foreground" />
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
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            {formatRelativeDate(knowledge.updated_at)}
          </div>

          <div className="flex items-center justify-end gap-1.5">
            <GraduationCap className="h-3.5 w-3.5" />0 cursos
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <Button asChild className="h-9 flex-1 px-3 text-xs">
            <Link href={`/knowledge/${knowledge.id}`}>Abrir</Link>
          </Button>

          <Button className="h-9 flex-1 px-3 text-xs" disabled variant="secondary">
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            IA
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}