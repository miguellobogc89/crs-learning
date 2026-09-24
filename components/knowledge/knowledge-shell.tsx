// components/knowledge/knowledge-shell.tsx
import { ReactNode } from "react";

import {
  AppSectionShell,
} from "@/components/app/section-sidebar";
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
  ];

  return (
    <AppSectionShell
      sidebar={
        <KnowledgeSidebar
          sidebarItems={sidebarItems}
          knowledgeLibraries={knowledgeLibraries}
          knowledgeTeams={knowledgeTeams}
          defaultLibraryId={defaultLibraryId}
        />
      }
    >
      <section className="h-full min-w-0 overflow-y-scroll overflow-x-hidden [scrollbar-gutter:stable]">
        {children}
      </section>
    </AppSectionShell>
  );
}
