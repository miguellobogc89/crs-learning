// components/home/overview/home-knowledge-table.tsx

import { DashboardKnowledgeTable } from "@/components/dashboard/dashboard-knowledge-table";
import type { DashboardDocumentItem } from "@/lib/services/dashboard.service";

type Props = {
  documents: DashboardDocumentItem[];
  totalCount: number;
};

export function HomeKnowledgeTable({
  documents,
  totalCount,
}: Props) {
  return (
    <section className="min-h-0">
      <DashboardKnowledgeTable
        documents={documents}
        totalCount={totalCount}
      />
    </section>
  );
}