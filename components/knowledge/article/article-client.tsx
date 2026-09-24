
// components/knowledge/article/article-client.tsx

"use client";

import { useCallback, useState } from "react";

import {
  saveEditableKnowledgeContentAction,
} from "@/app/actions/knowledge/editable-content.actions";

import { ShareLibraryDialog } from
  "@/components/knowledge/share-library-dialog";

import { useKnowledgeHeader } from
  "@/components/knowledge/detail/hooks/use-knowledge-header";

import { useKnowledgeDocuments } from
  "@/components/knowledge/detail/hooks/use-knowledge-documents";

import { useKnowledgeContentEditor } from
  "@/components/knowledge/detail/hooks/use-knowledge-content-editor";

import { ArticleDocumentsView } from
  "./content/documents/article-documents-view";

import { ArticleGeneralView } from
  "./content/general/article-general-view";

import { ArticleDetailsView } from
  "./content/details/article-details-view";

  
import { ArticleBody } from "./content/article-body";

import { ArticleHeader } from "./header/article-header";
import { ArticleTabs } from "./header/article-tabs";
import { ArticleLayout } from "./layout/article-layout";
import { useArticleAnalysis } from "./hooks/use-article-analysis";

import type {
  ArticleClientProps,
  ArticleTab,
} from "./lib/article.types";

function getSavedSummaryHtml(
  analysisJson: unknown,
): string {
  if (
    typeof analysisJson !== "object" ||
    analysisJson === null ||
    Array.isArray(analysisJson)
  ) {
    return "";
  }

  const editableContent =
    (analysisJson as Record<string, unknown>)
      .editableContent;

  if (
    typeof editableContent !== "object" ||
    editableContent === null ||
    Array.isArray(editableContent)
  ) {
    return "";
  }

  const html =
    (editableContent as Record<string, unknown>)
      .generalSummaryHtml;

  return typeof html === "string" ? html : "";
}

export function ArticleClient({
  knowledge,
  libraryPath,
  teams,
  libraryShares,
}: ArticleClientProps) {
  const [activeTab, setActiveTab] =
    useState<ArticleTab>("general");

  const header = useKnowledgeHeader({
    knowledge,
  });

  const documents = useKnowledgeDocuments({
    knowledge,
  });

  const analysis = useArticleAnalysis(knowledge);

  const initialHtml = getSavedSummaryHtml(
    knowledge.knowledge_analysis?.analysis_json,
  );

  const saveSummary = useCallback(
    async (html: string) => {
      await saveEditableKnowledgeContentAction({
        knowledgeId: knowledge.id,
        section: "general.summary",
        html,
      });
    },
    [knowledge.id],
  );

  const editor = useKnowledgeContentEditor({
    initialContent: initialHtml,
    onSave: saveSummary,
  });

  function handleStartEditing() {
    if (editor.isEditing || editor.isSaving) {
      return;
    }

    setActiveTab("general");
    editor.startEditing();
  }

  function handleTabChange(tab: ArticleTab) {
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
    }

    if (editor.isEditing) {
      editor.cancelEditing();
    }

    setActiveTab(tab);
  }

  return (
    <>
      <ArticleLayout
        header={
          <ArticleHeader
            title={header.title}
            knowledgeType={header.knowledgeType}
            visibility={header.visibility}
            libraryPath={libraryPath}
            updatedAt={knowledge.updated_at}
            updatedBy={
              knowledge.users_knowledge_sources_updated_by_user_idTousers
            }
            sharedTeamCount={libraryShares.length}
            metrics={analysis.metrics}
            isEditingTitle={header.isEditingTitle}
            isUpdating={header.isUpdatingHeader}
            isEditingContent={editor.isEditing}
            onTitleChange={header.setTitle}
            onEditTitle={header.startTitleEditing}
            onSaveTitle={header.saveTitle}
            onCancelTitle={header.cancelTitleEditing}
            onVisibilityChange={header.handleVisibilityChange}
            onEditContent={handleStartEditing}
            onShare={header.openShareDialog}
          />
        }
        tabs={
          <ArticleTabs
            activeTab={activeTab}
            documentCount={knowledge.knowledge_files.length}
            onTabChange={handleTabChange}
          />
        }
      >
        <div className="h-full overflow-y-auto">

<div className="mx-auto max-w-7xl px-6 py-8 lg:px-8">
  <ArticleBody>
    <div
      key={activeTab}
      className="animate-[article-fade-in_180ms_ease-out_both] motion-reduce:animate-none"
    >
              {activeTab === "general" && (
                <ArticleGeneralView
                  hasDocuments={documents.hasDocuments}
                  analysisJson={
                    knowledge.knowledge_analysis?.analysis_json
                  }
                  isRebuilding={documents.isRebuilding}
                  onRebuild={documents.handleRebuild}
                  isEditing={editor.isEditing}
                  isSaving={editor.isSaving}
                  hasChanges={editor.hasChanges}
                  saveError={editor.saveError}
                  htmlDraft={editor.content}
                  onHtmlDraftChange={editor.setContent}
                  onSave={editor.saveContent}
                  onCancel={editor.cancelEditing}
                />
              )}


              {activeTab === "details" && (
                <ArticleDetailsView
                  hasDocuments={documents.hasDocuments}
                  hasAnalysis={analysis.hasAnalysis}
                  isRebuilding={documents.isRebuilding}
                  rebuildError={documents.rebuildError}
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
                  onRebuild={documents.handleRebuild}
                />
              )}

              
              {activeTab === "documents" && (
                <ArticleDocumentsView
                  documents={knowledge.knowledge_files}
                />
              )}
            </div>
          </ArticleBody>
        </div>
      </div>

        <style jsx>{`
          @keyframes article-fade-in {
            from {
              opacity: 0;
              transform: translateY(4px);
            }

            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}</style>
      </ArticleLayout>

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