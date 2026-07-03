// components/knowledge/knowledge-header.tsx
import { Button } from "@/components/ui/button";
import { KNOWLEDGE_TYPE_LABELS } from "@/lib/knowledge/knowledge-types";
import { Pencil } from "lucide-react";

type Props = {
  title: string;
  description: string | null;
  knowledgeType: string;
  visibility: string;
  onEdit?: () => void;
};

export function KnowledgeHeader({
  title,
  description,
  knowledgeType,
  visibility,
  onEdit,
}: Props) {
  return (
    <header className="mb-8 border-b border-border pb-6">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-bold tracking-tight">
            {title}
          </h1>

          {description && (
            <p className="mt-2 max-w-4xl text-muted-foreground">
              {description}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border px-3 py-1 text-xs">
              {
                KNOWLEDGE_TYPE_LABELS[
                  knowledgeType as keyof typeof KNOWLEDGE_TYPE_LABELS
                ] ?? "Desconocido"
              }
            </span>

            <span className="rounded-full border px-3 py-1 text-xs capitalize">
              {visibility}
            </span>
          </div>
        </div>

        <Button onClick={onEdit} variant="outline">
          <Pencil className="mr-2 h-4 w-4" />
          Editar
        </Button>
      </div>
    </header>
  );
}