// components/knowledge/content/knowledge-grid.tsx
import Link from "next/link";
import { BookOpen, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { KnowledgeCard } from "./knowledge-card";

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
  knowledgeSources: KnowledgeSource[];
};

export function KnowledgeGrid({ knowledgeSources }: Props) {
  if (knowledgeSources.length === 0) {
    return (
      <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface text-muted-foreground">
          <BookOpen className="h-5 w-5" />
        </div>

        <h2 className="mt-4 text-sm font-medium text-foreground">
          Todavía no hay knowledge
        </h2>

        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          Crea una biblioteca para empezar a cargar documentos y preparar la
          generación de cursos.
        </p>

        <Button asChild className="mt-5">
          <Link href="/knowledge/new">
            <Plus className="mr-2 h-4 w-4" />
            Nuevo knowledge
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {knowledgeSources.map((knowledge) => (
        <KnowledgeCard key={knowledge.id} knowledge={knowledge} />
      ))}
    </div>
  );
}