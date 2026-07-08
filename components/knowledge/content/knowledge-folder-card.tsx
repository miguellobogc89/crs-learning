// components/knowledge/content/knowledge-folder-card.tsx
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Folder } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

type KnowledgeLibrary = {
  id: string;
  parent_id: string | null;
  name: string;
};

type Props = {
  folder: KnowledgeLibrary;
};

export function KnowledgeFolderCard({ folder }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleOpenFolder() {
    const params = new URLSearchParams(searchParams.toString());
    params.set("library", folder.id);

    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <Card
      className="group cursor-pointer border-border bg-card transition hover:-translate-y-0.5 hover:border-cyan-200 hover:shadow-sm"
      onDoubleClick={handleOpenFolder}
    >
      <CardContent className="flex h-full min-h-[160px] flex-col p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface text-muted-foreground">
            <Folder className="h-5 w-5" />
          </span>
        </div>

        <div className="flex flex-1 items-end">
          <h2 className="line-clamp-2 text-base font-semibold leading-6 text-foreground">
            {folder.name}
          </h2>
        </div>
      </CardContent>
    </Card>
  );
}