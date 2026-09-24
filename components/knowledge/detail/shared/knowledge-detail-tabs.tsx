
// components/knowledge/detail/shared/knowledge-detail-tabs.tsx

"use client";

import type { ActiveTab } from "../knowledge-detail.types";

import { KnowledgeEditActions } from "./knowledge-edit-actions";

type KnowledgeDetailTabsProps = {
  activeTab: ActiveTab;
  documentCount: number;
  onTabChange: (tab: ActiveTab) => void;
};

export function KnowledgeDetailTabs({
  activeTab,
  documentCount,
  onTabChange,
}: KnowledgeDetailTabsProps) {
  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex min-w-0 items-center gap-1">
        <KnowledgeTabButton
          active={activeTab === "general"}
          onClick={() => onTabChange("general")}
        >
          General
        </KnowledgeTabButton>

        <KnowledgeTabButton
          active={activeTab === "details"}
          onClick={() => onTabChange("details")}
        >
          Detalles

          <span className="ml-1.5 rounded bg-lesson-soft px-1.5 py-0.5 text-[9px] font-semibold uppercase text-lesson">
            IA
          </span>
        </KnowledgeTabButton>

        <KnowledgeTabButton
          active={activeTab === "documents"}
          onClick={() => onTabChange("documents")}
        >
          Documentos

          <span className="ml-1.5 rounded-full bg-surface px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {documentCount}
          </span>
        </KnowledgeTabButton>
      </div>

      <div className="flex items-center pb-1">
        <KnowledgeEditActions />
      </div>
    </div>
  );
}

type KnowledgeTabButtonProps = {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
};

function KnowledgeTabButton({
  active,
  onClick,
  children,
}: KnowledgeTabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "relative flex h-12 items-center px-4 text-sm font-medium transition-colors",
        active
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground",
      ].join(" ")}
    >
      {children}

      {active ? (
        <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-lesson" />
      ) : null}
    </button>
  );
}