// components/knowledge/article/layout/article-layout.tsx

import type { ReactNode } from "react";

import { AppPageLayout } from "@/components/app/layouts/app-page-layout";

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
    <AppPageLayout
      header={
        <>
          {header}
          {tabs}
        </>
      }
      contentClassName="overflow-hidden px-0 pb-0 sm:px-0 lg:px-0"
    >
      {children}
    </AppPageLayout>
  );
}