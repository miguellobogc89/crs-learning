// components/home/overview/home-overview.tsx

import { HomeKnowledgeTable } from "@/components/home/overview/home-knowledge-table";
import { HomeStats } from "@/components/home/overview/home-stats";
import type {
  DashboardDocumentItem,
} from "@/lib/services/dashboard.service";

type Props = {
  documentCount: number;
  storageBytes: number;
  folderCount: number;
  analyzedCount: number;
  recentDocuments: DashboardDocumentItem[];
};

export function HomeOverview({
  documentCount,
  storageBytes,
  folderCount,
  analyzedCount,
  recentDocuments,
}: Props) {
return (
  <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 pt-3">
      <HomeStats
        documentCount={documentCount}
        storageBytes={storageBytes}
        folderCount={folderCount}
        analyzedCount={analyzedCount}
      />

      <HomeKnowledgeTable
        documents={recentDocuments}
        totalCount={documentCount}
      />
    </div>
  );
}