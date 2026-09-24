
// components/knowledge/article/header/article-tabs.tsx

"use client";

import type { ReactNode } from "react";

export type ArticleTab =
  | "general"
  | "details"
  | "documents";

type ArticleTabsProps = {
  activeTab: ArticleTab;
  documentCount: number;
  onTabChange: (tab: ArticleTab) => void;
  actions?: ReactNode;
};

type ArticleTabButtonProps = {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
};

function ArticleTabButton({
  active,
  onClick,
  children,
}: ArticleTabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={[
        "relative flex h-12 items-center px-4 text-sm font-medium transition-colors",
        active
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground",
      ].join(" ")}
    >
      {children}


        {active && (
        <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-blue-600 dark:bg-blue-400" />
        )}
    </button>
  );
}

export function ArticleTabs({
  activeTab,
  documentCount,
  onTabChange,
  actions,
}: ArticleTabsProps) {
  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div
        role="navigation"
        aria-label="Secciones del artículo"
        className="flex min-w-0 items-center gap-1"
      >
        <ArticleTabButton
          active={activeTab === "general"}
          onClick={() => onTabChange("general")}
        >
          General
        </ArticleTabButton>

        <ArticleTabButton
          active={activeTab === "details"}
          onClick={() => onTabChange("details")}
        >
          Detalles

        </ArticleTabButton>

        <ArticleTabButton
          active={activeTab === "documents"}
          onClick={() => onTabChange("documents")}
        >
          Documentos

          <span className="ml-1.5 rounded-full bg-surface px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {documentCount}
          </span>
        </ArticleTabButton>
      </div>

      {actions ? (
        <div className="flex items-center pb-1">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
