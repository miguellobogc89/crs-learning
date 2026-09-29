// components/knowledge/content/knowledge-folder-grid.tsx
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Folder } from "lucide-react";

type KnowledgeLibrary = {
  id: string;
  parent_id: string | null;
  name: string;
};

type Props = {
  libraries: KnowledgeLibrary[];
};

export function KnowledgeFolderGrid({ libraries }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (libraries.length === 0) {
    return null;
  }

  function handleOpenLibrary(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("library", id);

    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="knowledge-grid-container mb-6 min-w-0">
      <h2 className="mb-3 text-body font-medium text-foreground">
        Carpetas
      </h2>

      <div className="knowledge-responsive-grid">
        {libraries.map((library) => (
          <button
            key={library.id}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition hover:border-cyan-200 hover:bg-surface-hover"
            type="button"
            onClick={() => handleOpenLibrary(library.id)}
          >
            <span className="flex size-control-lg shrink-0 items-center justify-center rounded-xl bg-surface text-muted-foreground">
              <Folder className="size-icon-xl" />
            </span>

            <span className="min-w-0 truncate text-body font-medium text-foreground">
              {library.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
