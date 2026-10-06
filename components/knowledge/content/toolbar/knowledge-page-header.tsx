// components/knowledge/content/toolbar/knowledge-page-header.tsx

"use client";

import type { ReactNode } from "react";

import { KnowledgeActions } from "./knowledge-actions";
import { KnowledgeNavigation } from "./knowledge-navigation";

import type { UploadType } from "./types";

type KnowledgePageHeaderProps = {
  title: string;
  breadcrumb: ReactNode;
  parentHref: string | null;
  onCreateFolder: () => void;
  onUpload: (type: UploadType) => void;
};

export function KnowledgePageHeader({
  title,
  breadcrumb,
  parentHref,
  onCreateFolder,
  onUpload,
}: KnowledgePageHeaderProps) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-6">
      <div className="min-w-0 flex-1">
        <KnowledgeNavigation
          breadcrumb={breadcrumb}
          title={title}
          parentHref={parentHref}
        />
      </div>

      <div className="flex shrink-0 items-center">
        <KnowledgeActions
          onCreateFolder={onCreateFolder}
          onUpload={onUpload}
        />
      </div>
    </div>
  );
}