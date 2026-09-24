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
  // El último elemento es la carpeta actual.
  // Ya se muestra como título debajo del breadcrumb.
  const parentPath = path.slice(0, -1);

  const showKnowledgeRoot =
    includeKnowledgeRoot || path.length === 0;

  return (
    <nav
      aria-label="Ruta de carpetas"
      className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground"
    >
      {showKnowledgeRoot ? (
        <Link
          href="/knowledge"
          className="transition-colors hover:text-foreground"
        >
          Mi biblioteca
        </Link>
      ) : null}

      {parentPath.map((library, index) => (
        <div
          key={library.id}
          className="inline-flex min-w-0 items-center gap-2"
        >
          {index > 0 || showKnowledgeRoot ? (
            <ChevronRight
              aria-hidden="true"
              className="h-3.5 w-3.5 shrink-0"
            />
          ) : null}

          <Link
            href={`/knowledge?library=${encodeURIComponent(library.id)}`}
            className="truncate transition-colors hover:text-foreground"
          >
            {library.name}
          </Link>
        </div>
      ))}
    </nav>
  );
}