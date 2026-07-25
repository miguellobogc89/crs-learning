// components/knowledge/detail/hooks/use-knowledge-content-editor.ts

"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";

import { updateKnowledgeAction } from "@/app/actions/knowledge";

import type { Knowledge } from "../knowledge-detail.types";

type UseKnowledgeContentEditorParams = {
  knowledge: Knowledge;
};

export function useKnowledgeContentEditor({
  knowledge,
}: UseKnowledgeContentEditorParams) {
  const router = useRouter();

  const initialContent = knowledge.content ?? "";

  const [content, setContent] = useState(initialContent);
  const [isEditing, setIsEditing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(
    null,
  );

  const [isSaving, startSavingTransition] =
    useTransition();

  useEffect(() => {
    if (isEditing) {
      return;
    }

    setContent(knowledge.content ?? "");
  }, [knowledge.content, isEditing]);

  const hasChanges = useMemo(() => {
    return content !== initialContent;
  }, [content, initialContent]);

  function startEditing() {
    setSaveError(null);
    setIsEditing(true);
  }

  function cancelEditing() {
    if (isSaving) {
      return;
    }

    setContent(initialContent);
    setSaveError(null);
    setIsEditing(false);
  }

  function createUpdateFormData() {
    const formData = new FormData();

    formData.set("id", knowledge.id);
    formData.set("title", knowledge.title);
    formData.set(
      "description",
      knowledge.description ?? "",
    );
    formData.set(
      "visibility",
      knowledge.visibility,
    );
    formData.set(
      "knowledgeType",
      knowledge.knowledge_type,
    );
    formData.set("content", content);

    return formData;
  }

  function saveContent() {
    if (isSaving) {
      return;
    }

    if (!hasChanges) {
      setIsEditing(false);
      return;
    }

    setSaveError(null);

    startSavingTransition(async () => {
      try {
        const formData = createUpdateFormData();

        await updateKnowledgeAction(formData);

        setIsEditing(false);

        router.refresh();
      } catch (error) {
        console.error(
          "No se pudo guardar el contenido:",
          error,
        );

        setSaveError(
          "No se pudieron guardar los cambios. Inténtalo de nuevo.",
        );
      }
    });
  }

  return {
    content,
    setContent,
    isEditing,
    isSaving,
    hasChanges,
    saveError,
    startEditing,
    cancelEditing,
    saveContent,
  };
}