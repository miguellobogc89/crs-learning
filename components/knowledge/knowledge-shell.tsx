// components/knowledge/knowledge-shell.tsx
import { ReactNode } from "react";

import { KnowledgeSidebar } from "@/components/knowledge/sidebar/knowledge-sidebar";

type Props = {
  knowledgeSources: any[];
  knowledgeLibraries: any[];
  children: ReactNode;
};

type SidebarItem = {
  label: string;
  count: number;
  icon: "book" | "file" | "shield" | "globe";
  active: boolean;
};

export function KnowledgeShell({
  knowledgeSources,
  knowledgeLibraries,
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
  ];

  return (
    <div className="grid h-full grid-cols-[280px_1fr] bg-background">
      <KnowledgeSidebar
        sidebarItems={sidebarItems}
        knowledgeLibraries={knowledgeLibraries}
        />

      <section className="min-w-0 overflow-auto">{children}</section>
    </div>
  );
}