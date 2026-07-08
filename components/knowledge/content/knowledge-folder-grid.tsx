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
    <div className="mb-6">
      <h2 className="mb-3 text-sm font-medium text-foreground">
        Carpetas
      </h2>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {libraries.map((library) => (
          <button
            key={library.id}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition hover:border-cyan-200 hover:bg-surface-hover"
            type="button"
            onClick={() => handleOpenLibrary(library.id)}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface text-muted-foreground">
              <Folder className="h-5 w-5" />
            </span>

            <span className="min-w-0 truncate text-sm font-medium text-foreground">
              {library.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}