// components/knowledge/detail/knowledge-detail-content.tsx

import { KnowledgeDetailsView } from "./details/knowledge-details-view";
import { KnowledgeDocumentsView } from "./documents/knowledge-documents-view";
import { KnowledgeGeneralView } from "./general/knowledge-general-view";
import { KnowledgeContentEditorSection } from "./knowledge-content-editor-section";

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

  onUpload: () => void;
  onRebuild: () => void;
};

export function KnowledgeDetailContent({
  activeTab,
  knowledge,
  hasDocuments,
  hasAnalysis,
  articleNeedsRebuild,
  isRebuilding,
  rebuildError,
  onUpload,
  onRebuild,
}: KnowledgeDetailContentProps) {
  switch (activeTab) {
    case "general":
      return (
        <KnowledgeDetailViewContainer>
          <div className="space-y-10">
            <KnowledgeContentEditorSection
              knowledge={knowledge}
            />

            <KnowledgeGeneralView
              hasDocuments={hasDocuments}
              hasAnalysis={hasAnalysis}
              isRebuilding={isRebuilding}
              knowledgeType={knowledge.knowledge_type}
              analysisJson={
                knowledge.knowledge_analysis
                  ?.analysis_json
              }
              analysisStatus={
                knowledge.knowledge_analysis
                  ?.status ?? null
              }
              analysisModel={
                knowledge.knowledge_analysis
                  ?.model ?? null
              }
              graph={knowledge.knowledge_graph}
              files={knowledge.knowledge_files}
              onRebuild={onRebuild}
              onUpload={onUpload}
            />
          </div>
        </KnowledgeDetailViewContainer>
      );

    case "details":
      return (
        <KnowledgeDetailViewContainer>
          <KnowledgeDetailsView
            hasDocuments={hasDocuments}
            hasAnalysis={hasAnalysis}
            isRebuilding={isRebuilding}
            rebuildError={rebuildError}
            knowledgeType={knowledge.knowledge_type}
            analysisJson={
              knowledge.knowledge_analysis
                ?.analysis_json
            }
            analysisStatus={
              knowledge.knowledge_analysis
                ?.status ?? null
            }
            analysisModel={
              knowledge.knowledge_analysis
                ?.model ?? null
            }
            graph={knowledge.knowledge_graph}
            files={knowledge.knowledge_files}
            onRebuild={onRebuild}
            onUpload={onUpload}
          />
        </KnowledgeDetailViewContainer>
      );

    case "documents":
      return (
        <KnowledgeDetailViewContainer>
          <KnowledgeDocumentsView
            files={knowledge.knowledge_files}
            analysis={knowledge.knowledge_analysis}
            articleNeedsRebuild={
              articleNeedsRebuild
            }
            isRebuilding={isRebuilding}
            rebuildError={rebuildError}
            onRebuild={onRebuild}
          />
        </KnowledgeDetailViewContainer>
      );

    default:
      return null;
  }
}

type KnowledgeDetailViewContainerProps = {
  children: React.ReactNode;
};

function KnowledgeDetailViewContainer({
  children,
}: KnowledgeDetailViewContainerProps) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-7xl px-6 py-8 lg:px-8">
        {children}
      </div>
    </div>
  );
}
