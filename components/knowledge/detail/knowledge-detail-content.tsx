
// components/knowledge/detail/knowledge-detail-content.tsx

"use client";

import type { KnowledgeExecutiveSummary } from
  "@/lib/knowledge/knowledge-analysis.types";

import { KnowledgeDetailsView } from
  "./details/knowledge-details-view";

import { KnowledgeDocumentsView } from
  "./documents/knowledge-documents-view";

import { KnowledgeGeneralView } from
  "./general/knowledge-general-view";

import { KnowledgeTabContainer } from
  "./shared/knowledge-tab-container";

import type {
  ActiveTab,
  Knowledge,
} from "./knowledge-detail.types";

type KnowledgeDetailContentProps = {
  activeTab: ActiveTab;
  knowledge: Knowledge;

  hasDocuments: boolean;
  hasAnalysis: boolean;

  articleNeedsRebuild: boolean;
  isRebuilding: boolean;
  rebuildError: string | null;

  onRebuild: () => void;

  isEditingContent: boolean;
  content: string;
  onContentChange: (value: string) => void;
  saveError: string | null;

  summaryDraft?: KnowledgeExecutiveSummary;
  onSummaryDraftChange?: (
    draft: KnowledgeExecutiveSummary,
  ) => void;
};

export function KnowledgeDetailContent({
  activeTab,
  knowledge,
  hasDocuments,
  hasAnalysis,
  articleNeedsRebuild,
  isRebuilding,
  rebuildError,
  onRebuild,
  isEditingContent,
  summaryDraft,
  onSummaryDraftChange,
}: KnowledgeDetailContentProps) {
  let tabContent: React.ReactNode;

  switch (activeTab) {
    case "general":
      tabContent = (
        <KnowledgeGeneralView
          hasDocuments={hasDocuments}
          hasAnalysis={hasAnalysis}
          isRebuilding={isRebuilding}
          knowledgeType={knowledge.knowledge_type}
          analysisJson={
            knowledge.knowledge_analysis?.analysis_json
          }
          analysisStatus={
            knowledge.knowledge_analysis?.status ?? null
          }
          analysisModel={
            knowledge.knowledge_analysis?.model ?? null
          }
          graph={knowledge.knowledge_graph}
          files={knowledge.knowledge_files}
          onRebuild={onRebuild}
          isEditing={isEditingContent}
          draft={summaryDraft}
          onDraftChange={onSummaryDraftChange}
        />
      );
      break;

    case "details":
      tabContent = (
        <KnowledgeDetailsView
          hasDocuments={hasDocuments}
          hasAnalysis={hasAnalysis}
          isRebuilding={isRebuilding}
          rebuildError={rebuildError}
          knowledgeType={knowledge.knowledge_type}
          analysisJson={
            knowledge.knowledge_analysis?.analysis_json
          }
          analysisStatus={
            knowledge.knowledge_analysis?.status ?? null
          }
          analysisModel={
            knowledge.knowledge_analysis?.model ?? null
          }
          graph={knowledge.knowledge_graph}
          files={knowledge.knowledge_files}
          onRebuild={onRebuild}
        />
      );
      break;

    case "documents":
      tabContent = (
        <KnowledgeDocumentsView
          files={knowledge.knowledge_files}
          analysis={knowledge.knowledge_analysis}
          articleNeedsRebuild={articleNeedsRebuild}
          isRebuilding={isRebuilding}
          rebuildError={rebuildError}
          onRebuild={onRebuild}
        />
      );
      break;

    default:
      return null;
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <KnowledgeTabContainer>
        {tabContent}
      </KnowledgeTabContainer>
    </div>
  );
}