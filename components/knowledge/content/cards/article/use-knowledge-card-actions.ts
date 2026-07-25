// components/knowledge/content/cards/article/use-knowledge-card-actions.ts
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  deleteKnowledgeAction,
  updateKnowledgeAction,
} from "@/app/actions/knowledge";

import type { KnowledgeSource } from "./types";

type Options = {
  knowledge: KnowledgeSource;
};

export function useKnowledgeCardActions({
  knowledge,
}: Options) {
  const router = useRouter();

  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [visibility, setVisibility] = useState(
    knowledge.visibility ?? "private",
  );

  const [isDeleting, startDeleteTransition] =
    useTransition();

  const [
    isUpdatingVisibility,
    startVisibilityTransition,
  ] = useTransition();

  const articleUrl = `/knowledge/${knowledge.id}`;

  function openArticle() {
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
    setError(null);

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
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se ha podido reprocesar el artículo",
      );
    } finally {
      setProcessing(false);
    }
  }

  function deleteArticle() {
    const confirmed = window.confirm(
      `¿Quieres eliminar el artículo "${knowledge.title}"?\n\nTambién se eliminarán sus archivos, análisis y datos asociados. Esta acción no se puede deshacer.`,
    );

    if (!confirmed) {
      return;
    }

    setError(null);

    startDeleteTransition(async () => {
      try {
        await deleteKnowledgeAction(knowledge.id);
        router.refresh();
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "No se ha podido eliminar el artículo",
        );
      }
    });
  }

  function changeVisibility(nextVisibility: string) {
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
        formData.set(
          "content",
          knowledge.content ?? "",
        );

        await updateKnowledgeAction(formData);
        router.refresh();
      } catch (caughtError) {
        console.error(caughtError);
        setVisibility(previousVisibility);
        setError(
          "No se ha podido cambiar la visibilidad",
        );
      }
    });
  }

  return {
    articleUrl,
    visibility,
    processing,
    error,
    isDeleting,
    isUpdatingVisibility,
    openArticle,
    reprocess,
    deleteArticle,
    changeVisibility,
  };
}