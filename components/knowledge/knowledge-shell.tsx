// components/knowledge/knowledge-shell.tsx
import { ReactNode } from "react";

import { KnowledgeSidebar } from "@/components/knowledge/sidebar/knowledge-sidebar";
import type { SidebarItem } from "@/components/knowledge/sidebar/types";

type Props = {
  knowledgeSources: any[];
  knowledgeLibraries: any[];
  knowledgeTeams: any[];
  defaultLibraryId: string | null;
  children: ReactNode;
};

export function KnowledgeShell({
  knowledgeSources,
  knowledgeLibraries,
  knowledgeTeams,
  defaultLibraryId,
  children,
}: Props) {
  const totalPublic = knowledgeSources.filter(
    (knowledge) => knowledge.visibility === "public",
  ).length;

  const totalPrivate = knowledgeSources.length - totalPublic;

  const sidebarItems: SidebarItem[] = [
    {
      label: "Todo",
      count: knowledgeSources.length,
      icon: "book",
      active: true,
    },
    {
      label: "Documentos",
      count: knowledgeSources.length,
      icon: "file",
      active: false,
    },
    {
      label: "Privados",
      count: totalPrivate,
      icon: "shield",
      active: false,
    },
    {
      label: "Públicos",
      count: totalPublic,
      icon: "globe",
      active: false,
    },
    {
      label: "Favoritos",
      count: 0,
      icon: "star",
      active: false,
    },
    {
      label: "Recientes",
      count: 0,
      icon: "clock",
      active: false,
    },
    {
      label: "Actividad",
      count: 0,
      icon: "activity",
      active: false,
    },
  ];

  return (
    <div className="grid h-full grid-cols-[280px_1fr] bg-background">
      <KnowledgeSidebar
        sidebarItems={sidebarItems}
        knowledgeLibraries={knowledgeLibraries}
        knowledgeTeams={knowledgeTeams}
        defaultLibraryId={defaultLibraryId}
      />

      <section className="min-w-0 overflow-y-scroll overflow-x-hidden [scrollbar-gutter:stable]">
        {children}
      </section>
    </div>
  );
}