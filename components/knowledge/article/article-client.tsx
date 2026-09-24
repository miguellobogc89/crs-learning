
// components/knowledge/article/article-client.tsx

"use client";

import { useState } from "react";

import { ShareLibraryDialog } from "@/components/knowledge/share-library-dialog";
import { useKnowledgeHeader } from "@/components/knowledge/detail/hooks/use-knowledge-header";

import { ArticleDocumentsView } from "./content/documents/article-documents-view";
import { ArticleGeneralView } from "./content/general/article-general-view";
import { ArticleDetailsView } from "./content/details/article-details-view";
import { ArticleHeader } from "./header/article-header";
import { ArticleTabs } from "./header/article-tabs";
import { ArticleLayout } from "./layout/article-layout";

import type {
  ArticleClientProps,
  ArticleTab,
} from "./lib/article.types";

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
            isEditingTitle={header.isEditingTitle}
            isUpdating={header.isUpdatingHeader}
            onTitleChange={header.setTitle}
            onEditTitle={header.startTitleEditing}
            onSaveTitle={header.saveTitle}
            onCancelTitle={header.cancelTitleEditing}
            onVisibilityChange={header.handleVisibilityChange}
            onShare={header.openShareDialog}
          />
        }
        tabs={
          <ArticleTabs
            activeTab={activeTab}
            documentCount={knowledge.knowledge_files.length}
            onTabChange={setActiveTab}
          />
        }
      >
        <div className="h-full overflow-y-auto">
          <div className="mx-auto max-w-7xl px-6 py-8 lg:px-8">
            <div
              key={activeTab}
              className="animate-[article-fade-in_180ms_ease-out_both] motion-reduce:animate-none"
            >
              {activeTab === "general" && (
                <ArticleGeneralView
                  description={knowledge.description}
                  content={knowledge.content}
                />
              )}

              {activeTab === "details" && (
                <ArticleDetailsView
                  knowledgeType={knowledge.knowledge_type}
                  visibility={header.visibility}
                  status={knowledge.status}
                  analysisStatus={
                    knowledge.knowledge_analysis?.status ?? null
                  }
                />
              )}

              {activeTab === "documents" && (
                <ArticleDocumentsView
                  documents={knowledge.knowledge_files}
                />
              )}
            </div>
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