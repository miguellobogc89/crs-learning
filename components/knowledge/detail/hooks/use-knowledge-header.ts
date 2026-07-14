// components/knowledge/detail/hooks/use-knowledge-header.ts

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { updateKnowledgeAction } from "@/app/actions/knowledge";

import type { Knowledge } from "../knowledge-detail.types";

type UseKnowledgeHeaderParams = {
  knowledge: Knowledge;
};

export function useKnowledgeHeader({
  knowledge,
}: UseKnowledgeHeaderParams) {
  const router = useRouter();

  const [title, setTitle] = useState(knowledge.title);

  const [visibility, setVisibility] = useState(
    knowledge.visibility,
  );

  const [isEditingTitle, setIsEditingTitle] =
    useState(false);

  const [
    isShareDialogOpen,
    setIsShareDialogOpen,
  ] = useState(false);

  const [
    isUpdatingHeader,
    startHeaderTransition,
  ] = useTransition();

  const description = knowledge.description ?? "";

  const knowledgeType =
    knowledge.knowledge_type ?? "unknown";

  function createUpdateFormData({
    nextTitle,
    nextVisibility,
  }: {
    nextTitle: string;
    nextVisibility: string;
  }) {
    const formData = new FormData();

    formData.set("id", knowledge.id);
    formData.set("title", nextTitle);
    formData.set("description", description);
    formData.set("visibility", nextVisibility);
    formData.set("knowledgeType", knowledgeType);
    formData.set(
      "content",
      knowledge.content ?? "",
    );

    return formData;
  }

  function startTitleEditing() {
    setIsEditingTitle(true);
  }

  function cancelTitleEditing() {
    setTitle(knowledge.title);
    setIsEditingTitle(false);
  }

  function saveTitle() {
    const normalizedTitle = title.trim();

    if (!normalizedTitle || isUpdatingHeader) {
      return;
    }

    startHeaderTransition(async () => {
      try {
        const formData = createUpdateFormData({
          nextTitle: normalizedTitle,
          nextVisibility: visibility,
        });

        await updateKnowledgeAction(formData);

        setTitle(normalizedTitle);
        setIsEditingTitle(false);

        router.refresh();
      } catch (error) {
        console.error(error);

        setTitle(knowledge.title);
      }
    });
  }

  function handleVisibilityChange(
    nextVisibility: string,
  ) {
    if (
      nextVisibility === visibility ||
      isUpdatingHeader
    ) {
      return;
    }

    const previousVisibility = visibility;

    setVisibility(nextVisibility);

    startHeaderTransition(async () => {
      try {
        const formData = createUpdateFormData({
          nextTitle: title,
          nextVisibility,
        });

        await updateKnowledgeAction(formData);

        router.refresh();
      } catch (error) {
        console.error(error);

        setVisibility(previousVisibility);
      }
    });
  }

  function openShareDialog() {
    if (!knowledge.library_id) {
      return;
    }

    setIsShareDialogOpen(true);
  }

  function closeShareDialog() {
    setIsShareDialogOpen(false);
  }

  return {
    title,
    setTitle,
    visibility,
    knowledgeType,
    isEditingTitle,
    isUpdatingHeader,
    isShareDialogOpen,
    startTitleEditing,
    cancelTitleEditing,
    saveTitle,
    handleVisibilityChange,
    openShareDialog,
    closeShareDialog,
  };
}