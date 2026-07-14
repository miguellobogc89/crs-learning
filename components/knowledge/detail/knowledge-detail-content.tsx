// components/knowledge/detail/knowledge-detail-content.tsx

import { KnowledgeDetailsView } from "./details/knowledge-details-view";
import { KnowledgeDocumentsView } from "./documents/knowledge-documents-view";
import { KnowledgeGeneralView } from "./general/knowledge-general-view";
import type {
  ActiveTab,
  Knowledge,
} from "./knowledge-detail.types";

type KnowledgeDetailContentProps = {
  activeTab: ActiveTab;
  knowledge: Knowledge;

  hasDocuments: boolean;
  hasAnalysis: boolean;

  showUpload: boolean;
  uploadFormId: string;
  uploadableFileCount: number;

  articleNeedsRebuild: boolean;
  isRebuilding: boolean;
  rebuildError: string | null;

  getContributionPercentage: (
    knowledgeFileId: string,
  ) => number | null;

  onUpload: () => void;
  onShowUpload: () => void;
  onCloseUpload: () => void;
  onRebuild: () => void;

  onUploadableFileCountChange: (
    count: number,
  ) => void;
};

export function KnowledgeDetailContent({
  activeTab,
  knowledge,
  hasDocuments,
  hasAnalysis,
  showUpload,
  uploadFormId,
  uploadableFileCount,
  articleNeedsRebuild,
  isRebuilding,
  rebuildError,
  getContributionPercentage,
  onUpload,
  onShowUpload,
  onCloseUpload,
  onRebuild,
  onUploadableFileCountChange,
}: KnowledgeDetailContentProps) {
  switch (activeTab) {
    case "general":
      return (
        <KnowledgeDetailViewContainer>
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
            onUpload={onUpload}
          />
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
            onUpload={onUpload}
          />
        </KnowledgeDetailViewContainer>
      );

    case "documents":
      return (
        <KnowledgeDetailViewContainer>
          <KnowledgeDocumentsView
            knowledgeId={knowledge.id}
            uploadFormId={uploadFormId}
            files={knowledge.knowledge_files}
            showUpload={showUpload}
            uploadableFileCount={uploadableFileCount}
            articleNeedsRebuild={articleNeedsRebuild}
            isRebuilding={isRebuilding}
            rebuildError={rebuildError}
            getContributionPercentage={
              getContributionPercentage
            }
            onShowUpload={onShowUpload}
            onCloseUpload={onCloseUpload}
            onRebuild={onRebuild}
            onUploadableFileCountChange={
              onUploadableFileCountChange
            }
          />
        </KnowledgeDetailViewContainer>
      );
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