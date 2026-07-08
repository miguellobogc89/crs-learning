// components/knowledge/content/knowledge-library-breadcrumb.tsx
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";

import type { LibraryItem } from "@/components/knowledge/sidebar/types";

type Props = {
  path: LibraryItem[];
};

export function KnowledgeLibraryBreadcrumb({ path }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (path.length === 0) {
    return null;
  }

  function handleNavigate(libraryId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("library", libraryId);

    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <nav className="mb-4 flex items-center gap-1 text-sm text-muted-foreground">
      {path.map((library, index) => {
        const isLast = index === path.length - 1;

        return (
          <div key={library.id} className="flex items-center gap-1">
            <button
              className={[
                "rounded-md px-2 py-1 transition hover:bg-surface hover:text-foreground",
                isLast ? "font-medium text-foreground" : "",
              ].join(" ")}
              type="button"
              onClick={() => handleNavigate(library.id)}
            >
              {library.name}
            </button>

            {!isLast ? <ChevronRight className="h-4 w-4" /> : null}
          </div>
        );
      })}
    </nav>
  );
}