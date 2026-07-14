// components/knowledge/detail/hooks/use-knowledge-detail.ts

import { useState } from "react";

import type {
  ActiveTab,
  Knowledge,
} from "../knowledge-detail.types";
import { useKnowledgeAnalysis } from "./use-knowledge-analysis";
import { useKnowledgeDocuments } from "./use-knowledge-documents";
import { useKnowledgeHeader } from "./use-knowledge-header";

type UseKnowledgeDetailParams = {
  knowledge: Knowledge;
};

export function useKnowledgeDetail({
  knowledge,
}: UseKnowledgeDetailParams) {
  const [activeTab, setActiveTab] =
    useState<ActiveTab>("general");

  const header = useKnowledgeHeader({
    knowledge,
  });

  const documents = useKnowledgeDocuments({
    knowledge,
    setActiveTab,
  });

  const analysis = useKnowledgeAnalysis({
    knowledge,
  });

  return {
    activeTab,
    setActiveTab,
    header,
    documents,
    analysis,
  };
}