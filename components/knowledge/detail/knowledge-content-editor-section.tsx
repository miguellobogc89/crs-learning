// components/knowledge/detail/knowledge-content-editor-section.tsx

"use client";

import {
  Check,
  Edit3,
  FileText,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { KnowledgeEditor } from "@/components/knowledge/editor/knowledge-editor";
import { Button } from "@/components/ui/button";

import { useKnowledgeContentEditor } from "./hooks/use-knowledge-content-editor";

import type { Knowledge } from "./knowledge-detail.types";

type KnowledgeContentEditorSectionProps = {
  knowledge: Knowledge;
};

export function KnowledgeContentEditorSection({
  knowledge,
}: KnowledgeContentEditorSectionProps) {
  const router = useRouter();

  const [isRebuilding, setIsRebuilding] =
    useState(false);

  const [rebuildError, setRebuildError] =
    useState<string | null>(null);

  const {
    content,
    setContent,
    isEditing,
    isSaving,
    hasChanges,
    saveError,
    startEditing,
    cancelEditing,
    saveContent,
  } = useKnowledgeContentEditor({
    knowledge,
  });

  const hasContent = hasMeaningfulContent(content);

  const hasDocuments =
    knowledge.knowledge_files.length > 0;

  async function rebuildArticle() {
    if (isRebuilding || !hasDocuments) {
      return;
    }

    setIsRebuilding(true);
    setRebuildError(null);

    try {
      const response = await fetch(
        `/api/knowledge/articles/${knowledge.id}/rebuild`,
        {
          method: "POST",
        },
      );

      const result = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          result.error ??
            "No se ha podido reconstruir el artículo",
        );
      }

      router.refresh();
    } catch (caughtError) {
      setRebuildError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se ha podido reconstruir el artículo",
      );
    } finally {
      setIsRebuilding(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Contenido
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            Información consolidada y editable del
            artículo.
          </p>
        </div>

        {isEditing ? (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isSaving}
              onClick={cancelEditing}
            >
              <X className="mr-2 h-4 w-4" />
              Cancelar
            </Button>

            <Button
              type="button"
              disabled={isSaving || !hasChanges}
              onClick={saveContent}
            >
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}

              {isSaving
                ? "Guardando..."
                : "Guardar cambios"}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={
                isRebuilding || !hasDocuments
              }
              onClick={rebuildArticle}
            >
              {isRebuilding ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}

              {isRebuilding
                ? "Reconstruyendo..."
                : "Reconstruir"}
            </Button>

            <Button
              type="button"
              variant="outline"
              disabled={isRebuilding}
              onClick={startEditing}
            >
              <Edit3 className="mr-2 h-4 w-4" />
              Editar contenido
            </Button>
          </div>
        )}
      </div>

      {saveError ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {saveError}
        </div>
      ) : null}

      {rebuildError ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {rebuildError}
        </div>
      ) : null}

      {isEditing ? (
        <KnowledgeEditor
          value={content}
          onChange={setContent}
          editable
        />
      ) : hasContent ? (
        <KnowledgeEditor
          value={content}
          onChange={() => undefined}
          editable={false}
          className="border-0 bg-transparent"
        />
      ) : (
        <KnowledgeContentEmptyState
          onEdit={startEditing}
        />
      )}
    </section>
  );
}

type KnowledgeContentEmptyStateProps = {
  onEdit: () => void;
};

function KnowledgeContentEmptyState({
  onEdit,
}: KnowledgeContentEmptyStateProps) {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/10 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <FileText className="h-5 w-5" />
      </div>

      <h3 className="mt-4 text-base font-semibold text-foreground">
        Este artículo todavía no tiene contenido
      </h3>

      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        Añade texto estructurado, títulos, listas y
        explicaciones para convertirlo en una fuente de
        conocimiento útil.
      </p>

      <Button
        type="button"
        className="mt-5"
        onClick={onEdit}
      >
        <Edit3 className="mr-2 h-4 w-4" />
        Añadir contenido
      </Button>
    </div>
  );
}

function hasMeaningfulContent(content: string) {
  const normalizedContent = content
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();

  return normalizedContent.length > 0;
}