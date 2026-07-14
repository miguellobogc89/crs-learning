// components/knowledge/detail/knowledge-detail-client.tsx

"use client";

import { ShareLibraryDialog } from "@/components/knowledge/share-library-dialog";

import { useKnowledgeDetail } from "./hooks/use-knowledge-detail";
import { KnowledgeDetailContent } from "./knowledge-detail-content";
import { KnowledgeDetailLayout } from "./knowledge-detail-layout";
import type { KnowledgeDetailClientProps } from "./knowledge-detail.types";

export function KnowledgeDetailClient({
  knowledge,
  libraryPath,
  teams,
  libraryShares,
}: KnowledgeDetailClientProps) {
  const uploadFormId =
    "knowledge-document-upload-form";

  const {
    activeTab,
    setActiveTab,
    header,
    documents,
    analysis,
  } = useKnowledgeDetail({
    knowledge,
  });

  return (
    <>
      <KnowledgeDetailLayout
        title={header.title}
        knowledgeType={header.knowledgeType}
        visibility={header.visibility}
        libraryPath={libraryPath}
        updatedAt={knowledge.updated_at}
        updatedBy={
          knowledge
            .users_knowledge_sources_updated_by_user_idTousers
        }
        sharedTeamCount={libraryShares.length}
        isEditingTitle={header.isEditingTitle}
        isUpdatingHeader={
          header.isUpdatingHeader
        }
        activeTab={activeTab}
        documentCount={
          knowledge.knowledge_files.length
        }
        metrics={analysis.metrics}
        onTitleChange={header.setTitle}
        onEditTitle={
          header.startTitleEditing
        }
        onSaveTitle={header.saveTitle}
        onCancelTitle={
          header.cancelTitleEditing
        }
        onVisibilityChange={
          header.handleVisibilityChange
        }
        onShare={header.openShareDialog}
        onTabChange={setActiveTab}
      >
        <KnowledgeDetailContent
          activeTab={activeTab}
          knowledge={knowledge}
          hasDocuments={
            documents.hasDocuments
          }
          hasAnalysis={analysis.hasAnalysis}
          showUpload={documents.showUpload}
          uploadFormId={uploadFormId}
          uploadableFileCount={
            documents.uploadableFileCount
          }
          articleNeedsRebuild={
            documents.articleNeedsRebuild
          }
          isRebuilding={
            documents.isRebuilding
          }
          rebuildError={
            documents.rebuildError
          }
          getContributionPercentage={
            analysis.getContributionPercentage
          }
          onUpload={documents.openUpload}
          onShowUpload={
            documents.showUploadForm
          }
          onCloseUpload={
            documents.closeUpload
          }
          onRebuild={
            documents.handleRebuild
          }
          onUploadableFileCountChange={
            documents.setUploadableFileCount
          }
        />
      </KnowledgeDetailLayout>

      <ShareLibraryDialog
        open={header.isShareDialogOpen}
        libraryId={knowledge.library_id}
        libraryName={
          libraryPath[
            libraryPath.length - 1
          ]?.name ?? "Carpeta"
        }
        teams={teams}
        shares={libraryShares}
        onClose={header.closeShareDialog}
      />
    </>
  );
}