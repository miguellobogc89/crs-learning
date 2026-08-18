// components/knowledge/detail/hooks/use-knowledge-documents.ts

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { rebuildKnowledgeAction } from "@/app/actions/knowledge";

import type { Knowledge } from "../knowledge-detail.types";

type UseKnowledgeDocumentsParams = {
  knowledge: Knowledge;
};

export function useKnowledgeDocuments({
  knowledge,
}: UseKnowledgeDocumentsParams) {
  const router = useRouter();

  const [rebuildError, setRebuildError] =
    useState<string | null>(null);

  const [isRebuilding, startRebuildTransition] =
    useTransition();

  const hasDocuments =
    knowledge.knowledge_files.length > 0;

  const articleNeedsRebuild =
    knowledge.status === "stale" ||
    knowledge.knowledge_analysis?.status === "stale";

  function handleRebuild() {
    if (!hasDocuments || isRebuilding) {
      return;
    }

    setRebuildError(null);

    startRebuildTransition(async () => {
      try {
        await rebuildKnowledgeAction(
          knowledge.id,
        );

        router.refresh();
      } catch (caughtError) {
        if (caughtError instanceof Error) {
          setRebuildError(
            caughtError.message,
          );

          return;
        }

        setRebuildError(
          "No se ha podido actualizar el conocimiento",
        );
      }
    });
  }

  return {
    rebuildError,
    isRebuilding,
    hasDocuments,
    articleNeedsRebuild,
    handleRebuild,
  };
}
