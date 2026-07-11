// components/knowledge/content/knowledge-library-breadcrumb.tsx
"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import type { LibraryItem } from "@/components/knowledge/sidebar/types";

type Props = {
  path: LibraryItem[];
  includeKnowledgeRoot?: boolean;
};

export function KnowledgeLibraryBreadcrumb({
  path,
  includeKnowledgeRoot = false,
}: Props) {
  if (path.length === 0 && !includeKnowledgeRoot) {
    return null;
  }

  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
      {includeKnowledgeRoot ? (
        <>
          <Link
            href="/knowledge"
            className="rounded-md px-2 py-1 transition hover:bg-surface hover:text-foreground"
          >
            Knowledge
          </Link>

          {path.length > 0 ? (
            <ChevronRight className="h-4 w-4" />
          ) : null}
        </>
      ) : null}

      {path.map((library, index) => {
        const isLast = index === path.length - 1;

        return (
          <div
            key={library.id}
            className="flex items-center gap-1"
          >
            <Link
              href={`/knowledge?library=${library.id}`}
              className={[
                "rounded-md px-2 py-1 transition hover:bg-surface hover:text-foreground",
                isLast ? "font-medium text-foreground" : "",
              ].join(" ")}
            >
              {library.name}
            </Link>

            {!isLast ? (
              <ChevronRight className="h-4 w-4" />
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}