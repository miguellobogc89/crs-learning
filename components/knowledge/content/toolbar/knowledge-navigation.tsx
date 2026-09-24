// components/knowledge/content/toolbar/knowledge-navigation.tsx

"use client";

import type { ReactNode } from "react";

type Props = {
  breadcrumb: ReactNode;
  title: string;
  parentHref: string | null;
};

export function KnowledgeNavigation({
  breadcrumb,
  title,
}: Props) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="min-w-0 text-sm text-muted-foreground">
        {breadcrumb}
      </div>

      <h1 className="min-w-0 truncate text-[26px] font-semibold leading-tight tracking-[-0.025em] text-foreground">
        {title}
      </h1>
    </div>
  );
}