
// components/knowledge/detail/hooks/use-knowledge-content-editor.ts

"use client";

import {
  useCallback,
  useEffect,
  useState,
  useTransition,
} from "react";

type UseKnowledgeContentEditorParams = {
  initialContent: string;
  onSave: (content: string) => Promise<void>;
};

export function useKnowledgeContentEditor({
  initialContent,
  onSave,
}: UseKnowledgeContentEditorParams) {
  const [savedContent, setSavedContent] =
    useState(initialContent);

  const [content, setContent] =
    useState(initialContent);

  const [isEditing, setIsEditing] =
    useState(false);

  const [saveError, setSaveError] =
    useState<string | null>(null);

  const [isSaving, startSavingTransition] =
    useTransition();

  useEffect(() => {
    if (isEditing) {
      return;
    }

    setSavedContent(initialContent);
    setContent(initialContent);
  }, [initialContent, isEditing]);

  const hasChanges = content !== savedContent;

  const startEditing = useCallback(() => {
    if (isSaving) {
      return;
    }

    setContent(savedContent);
    setSaveError(null);
    setIsEditing(true);
  }, [isSaving, savedContent]);

  const cancelEditing = useCallback(() => {
    if (isSaving) {
      return;
    }

    setContent(savedContent);
    setSaveError(null);
    setIsEditing(false);
  }, [isSaving, savedContent]);

  const saveContent = useCallback(() => {
    if (isSaving || !isEditing || !hasChanges) {
      return;
    }

    const contentToSave = content;

    setSaveError(null);

    startSavingTransition(async () => {
      try {
        await onSave(contentToSave);

        setSavedContent(contentToSave);
        setContent(contentToSave);
        setIsEditing(false);
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
  }, [
    content,
    hasChanges,
    isEditing,
    isSaving,
    onSave,
  ]);

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