// components/knowledge/article/layout/article-layout.tsx
// components/knowledge/article/layout/article-layout.tsx

import type { ReactNode } from "react";

type ArticleLayoutProps = {
  header: ReactNode;
  tabs: ReactNode;
  children: ReactNode;
};

export function ArticleLayout({
  header,
  tabs,
  children,
}: ArticleLayoutProps) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="shrink-0 border-b border-border bg-background">
        <div className="mx-auto max-w-7xl px-6 pt-4 lg:px-8">
          {header}
          {tabs}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  );
}