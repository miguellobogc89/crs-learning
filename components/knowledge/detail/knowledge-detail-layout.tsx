// components/knowledge/detail/knowledge-detail-layout.tsx

import { KnowledgeDetailHeader } from "./header/knowledge-detail-header";
import type { KnowledgeInsightMetrics } from "./header/knowledge-header-insights";
import type {
  ActiveTab,
  KnowledgeUpdatedByUser,
  LibraryPathItem,
} from "./knowledge-detail.types";
import { KnowledgeDetailTabs } from "./shared/knowledge-detail-tabs";

type Props = {
  title: string;
  knowledgeType: string;
  visibility: string;
  libraryPath: LibraryPathItem[];
  updatedAt: Date | string;
  updatedBy: KnowledgeUpdatedByUser | null;
  sharedTeamCount: number;
  isEditingTitle: boolean;
  isUpdatingHeader: boolean;
  activeTab: ActiveTab;
  documentCount: number;
  metrics: KnowledgeInsightMetrics;
  onTitleChange: (value: string) => void;
  onEditTitle: () => void;
  onSaveTitle: () => void;
  onCancelTitle: () => void;
  onVisibilityChange: (
    visibility: string,
  ) => void;
  onShare: () => void;
  onTabChange: (
    tab: ActiveTab,
  ) => void;
  children: React.ReactNode;
};

export function KnowledgeDetailLayout({
  title,
  knowledgeType,
  visibility,
  libraryPath,
  updatedAt,
  updatedBy,
  sharedTeamCount,
  isEditingTitle,
  isUpdatingHeader,
  activeTab,
  documentCount,
  metrics,
  onTitleChange,
  onEditTitle,
  onSaveTitle,
  onCancelTitle,
  onVisibilityChange,
  onShare,
  onTabChange,
  children,
}: Props) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="shrink-0 border-b border-border bg-background">
        <div className="mx-auto max-w-7xl px-6 pt-4 lg:px-8">
          <KnowledgeDetailHeader
            title={title}
            knowledgeType={knowledgeType}
            visibility={visibility}
            libraryPath={libraryPath}
            updatedAt={updatedAt}
            updatedBy={updatedBy}
            sharedTeamCount={sharedTeamCount}
            isEditingTitle={isEditingTitle}
            isUpdating={isUpdatingHeader}
            metrics={metrics}
            onTitleChange={onTitleChange}
            onEditTitle={onEditTitle}
            onSaveTitle={onSaveTitle}
            onCancelTitle={onCancelTitle}
            onVisibilityChange={
              onVisibilityChange
            }
            onShare={onShare}
          />

          <KnowledgeDetailTabs
            activeTab={activeTab}
            documentCount={documentCount}
            onTabChange={onTabChange}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  );
}