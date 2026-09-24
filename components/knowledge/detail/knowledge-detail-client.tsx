
// components/knowledge/detail/knowledge-detail-client.tsx

"use client";

import { ShareLibraryDialog } from "@/components/knowledge/share-library-dialog";

import { useKnowledgeDetail } from "./hooks/use-knowledge-detail";
import { useKnowledgeContentEditor } from "./hooks/use-knowledge-content-editor";
import { KnowledgeDetailContent } from "./knowledge-detail-content";
import { KnowledgeDetailLayout } from "./knowledge-detail-layout";

import type {
  ActiveTab,
  KnowledgeDetailClientProps,
} from "./knowledge-detail.types";

export function KnowledgeDetailClient({
  knowledge,
  libraryPath,
  teams,
  libraryShares,
}: KnowledgeDetailClientProps) {
  const {
    activeTab,
    setActiveTab,
    header,
    documents,
    analysis,
  } = useKnowledgeDetail({ knowledge });

  const editor = useKnowledgeContentEditor({
    knowledge,
  });

  function handleStartEditing() {
    if (editor.isEditing || editor.isSaving) {
      return;
    }

    setActiveTab("general");
    editor.startEditing();
  }

  function handleTabChange(tab: ActiveTab) {
    if (editor.isSaving) {
      return;
    }

    if (editor.isEditing && editor.hasChanges) {
      const discard = window.confirm(
        "Tienes cambios sin guardar. ¿Quieres descartarlos y cambiar de pestaña?",
      );

      if (!discard) {
        return;
      }

      editor.cancelEditing();
    } else if (editor.isEditing) {
      editor.cancelEditing();
    }

    setActiveTab(tab);
  }

  return (
    <>
      <KnowledgeDetailLayout
        title={header.title}
        knowledgeType={header.knowledgeType}
        visibility={header.visibility}
        libraryPath={libraryPath}
        updatedAt={knowledge.updated_at}
        updatedBy={
          knowledge.users_knowledge_sources_updated_by_user_idTousers
        }
        sharedTeamCount={libraryShares.length}
        isEditingTitle={header.isEditingTitle}
        isUpdatingHeader={header.isUpdatingHeader}
        activeTab={activeTab}
        documentCount={knowledge.knowledge_files.length}
        metrics={analysis.metrics}
        onTitleChange={header.setTitle}
        onEditTitle={header.startTitleEditing}
        onSaveTitle={header.saveTitle}
        onCancelTitle={header.cancelTitleEditing}
        onVisibilityChange={header.handleVisibilityChange}
        onShare={header.openShareDialog}
        onTabChange={handleTabChange}
        onEditContent={handleStartEditing}
        isEditingContent={editor.isEditing}
        isSavingContent={editor.isSaving}
        hasContentChanges={editor.hasChanges}
        onSaveContent={editor.saveContent}
        onCancelContent={editor.cancelEditing}
      >
        <KnowledgeDetailContent
          activeTab={activeTab}
          knowledge={knowledge}
          hasDocuments={documents.hasDocuments}
          hasAnalysis={analysis.hasAnalysis}
          articleNeedsRebuild={
            documents.articleNeedsRebuild
          }
          isRebuilding={documents.isRebuilding}
          rebuildError={documents.rebuildError}
          onRebuild={documents.handleRebuild}
          isEditingContent={editor.isEditing}
          content={editor.content}
          onContentChange={editor.setContent}
          saveError={editor.saveError}
        />
      </KnowledgeDetailLayout>

      <ShareLibraryDialog
        open={header.isShareDialogOpen}
        libraryId={knowledge.library_id}
        libraryName={
          libraryPath[libraryPath.length - 1]?.name ??
          "Carpeta"
        }
        teams={teams}
        shares={libraryShares}
        onClose={header.closeShareDialog}
      />
    </>
  );
}