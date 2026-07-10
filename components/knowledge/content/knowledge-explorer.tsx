// components/knowledge/content/knowledge-explorer.tsx
"use client";

import Link from "next/link";
import { FileText, Folder, UsersRound } from "lucide-react";

import { KnowledgeCard } from "./knowledge-card";
import { KnowledgeFolderCard } from "./knowledge-folder-card";

type KnowledgeLibrary = {
  id: string;
  parent_id: string | null;
  name: string;
  is_shared?: boolean;
};

type KnowledgeSource = {
  id: string;
  title: string;
  description?: string | null;
  content?: string | null;
  summary?: string | null;
  language?: string | null;
  domain?: string | null;
  level?: string | null;
  tags?: unknown;
  status?: string | null;
  visibility?: string | null;
  updated_at?: Date | string | null;
  knowledge_type?: string | null;
  confidence?: number | null;
};

type Props = {
  folders: KnowledgeLibrary[];
  knowledgeSources: KnowledgeSource[];
  viewMode: "grid" | "list";
};

function getStatusLabel(status: string | null | undefined) {
  if (status === "ready" || status === "processed") return "IA procesada";
  if (status === "processing") return "Procesando";
  if (status === "error") return "Error";

  return "Borrador";
}

function getSummary(knowledge: KnowledgeSource) {
  return (
    knowledge.summary?.trim() ||
    knowledge.description?.trim() ||
    knowledge.content?.trim() ||
    ""
  );
}

function getFolderIcon(folder: KnowledgeLibrary) {
  if (folder.is_shared) {
    return <UsersRound className="h-5 w-5 text-brand" strokeWidth={2.25} />;
  }

  return <Folder className="h-5 w-5" strokeWidth={2.25} />;
}

export function KnowledgeExplorer({
  folders,
  knowledgeSources,
  viewMode,
}: Props) {
  if (folders.length === 0 && knowledgeSources.length === 0) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-border bg-card text-center">
        <p className="text-sm text-muted-foreground">
          Esta biblioteca está vacía.
        </p>
      </div>
    );
  }

  if (viewMode === "list") {
    return (
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="grid grid-cols-[1fr_160px_140px_140px] border-b border-border px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <div>Nombre</div>
          <div>Dominio</div>
          <div>Tipo</div>
          <div>Estado</div>
        </div>

        <div className="divide-y divide-border">
          {folders.map((folder) => (
            <Link
              key={folder.id}
              href={`/knowledge?library=${folder.id}`}
              className="grid grid-cols-[1fr_160px_140px_140px] items-center px-4 py-3 text-sm hover:bg-surface"
            >
              <div className="flex items-center gap-3 font-medium text-foreground">
                {getFolderIcon(folder)}
                {folder.name}
              </div>

              <div className="text-muted-foreground">—</div>
              <div className="text-muted-foreground">
                {folder.is_shared ? "Compartida" : "Carpeta"}
              </div>
              <div className="text-muted-foreground">—</div>
            </Link>
          ))}

          {knowledgeSources.map((knowledge) => (
            <Link
              key={knowledge.id}
              href={`/knowledge/${knowledge.id}`}
              className="grid grid-cols-[1fr_160px_140px_140px] items-center px-4 py-3 text-sm hover:bg-surface"
            >
              <div className="flex min-w-0 items-center gap-3">
                <FileText
                  className="h-5 w-5 shrink-0 text-muted-foreground"
                  strokeWidth={2.25}
                />

                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">
                    {knowledge.title}
                  </p>

                  {getSummary(knowledge) && (
                    <p className="truncate text-xs text-muted-foreground">
                      {getSummary(knowledge)}
                    </p>
                  )}
                </div>
              </div>

              <div className="truncate text-muted-foreground">
                {knowledge.domain ?? "—"}
              </div>

              <div className="text-muted-foreground">Documento</div>

              <div className="text-muted-foreground">
                {getStatusLabel(knowledge.status)}
              </div>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {folders.map((folder) => {
        if (folder.is_shared) {
          return (
            <Link
              key={folder.id}
              href={`/knowledge?library=${folder.id}`}
              className="rounded-2xl border border-border bg-card p-5 transition hover:bg-surface"
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand">
                <UsersRound className="h-5 w-5" />
              </div>

              <h3 className="font-semibold">{folder.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Biblioteca compartida contigo.
              </p>
            </Link>
          );
        }

        return <KnowledgeFolderCard key={folder.id} folder={folder} />;
      })}

      {knowledgeSources.map((knowledge) => (
        <KnowledgeCard key={knowledge.id} knowledge={knowledge} />
      ))}
    </div>
  );
}