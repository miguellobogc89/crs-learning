// components/knowledge/detail/hooks/use-knowledge-documents.ts

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { rebuildKnowledgeAction } from "@/app/actions/knowledge";

import type {
  ActiveTab,
  Knowledge,
} from "../knowledge-detail.types";

type UseKnowledgeDocumentsParams = {
  knowledge: Knowledge;
  setActiveTab: (tab: ActiveTab) => void;
};

export function useKnowledgeDocuments({
  knowledge,
  setActiveTab,
}: UseKnowledgeDocumentsParams) {
  const router = useRouter();

  const [showUpload, setShowUpload] =
    useState(false);

  const [
    uploadableFileCount,
    setUploadableFileCount,
  ] = useState(0);

  const [rebuildError, setRebuildError] =
    useState<string | null>(null);

  const [isRebuilding, startRebuildTransition] =
    useTransition();

  const hasDocuments =
    knowledge.knowledge_files.length > 0;

  const articleNeedsRebuild =
    knowledge.status === "stale" ||
    knowledge.knowledge_analysis?.status === "stale";

  function openUpload() {
    setActiveTab("documents");
    setShowUpload(true);
  }

  function showUploadForm() {
    setShowUpload(true);
  }

  function closeUpload() {
    setShowUpload(false);
    setUploadableFileCount(0);
  }

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
    showUpload,
    uploadableFileCount,
    setUploadableFileCount,
    rebuildError,
    isRebuilding,
    hasDocuments,
    articleNeedsRebuild,
    openUpload,
    showUploadForm,
    closeUpload,
    handleRebuild,
  };
}