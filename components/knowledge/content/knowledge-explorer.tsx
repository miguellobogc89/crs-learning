// components/knowledge/content/knowledge-explorer.tsx
"use client";

import Link from "next/link";
import {
  Clock,
  FileStack,
  FileText,
  Folder,
  FolderTree,
  Plus,
  UsersRound,
} from "lucide-react";

import { KnowledgeCard } from "./knowledge-card";
import { KnowledgeFolderCard } from "./knowledge-folder-card";

type KnowledgeLibrary = {
  id: string;
  parent_id: string | null;
  name: string;
  is_shared?: boolean;
  created_at?: Date | string | null;
  updated_at?: Date | string | null;
  article_count?: number;
  folder_count?: number;
  file_count?: number;
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
  selectedLibraryId: string | null;
  selectedView: string;
  canCreateArticle: boolean;
  onCreateArticle: () => void;
};

function getStatusLabel(status: string | null | undefined) {
  if (status === "ready" || status === "processed") {
    return "IA procesada";
  }

  if (status === "processing") {
    return "Procesando";
  }

  if (status === "error") {
    return "Error";
  }

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

function formatRelativeDate(date: Date | string | null | undefined) {
  if (!date) {
    return "Sin fecha";
  }

  const timestamp = new Date(date).getTime();

  const diffMinutes = Math.max(
    1,
    Math.floor((Date.now() - timestamp) / 60000),
  );

  if (diffMinutes < 60) {
    return `Hace ${diffMinutes} min`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `Hace ${diffHours} h`;
  }

  const diffDays = Math.floor(diffHours / 24);

  if (diffDays < 30) {
    return `Hace ${diffDays} días`;
  }

  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

function getFolderIcon(folder: KnowledgeLibrary) {
  if (folder.is_shared) {
    return (
      <UsersRound
        className="h-5 w-5 text-brand"
        strokeWidth={2.25}
      />
    );
  }

  return <Folder className="h-5 w-5" strokeWidth={2.25} />;
}

export function KnowledgeExplorer({
  folders,
  knowledgeSources,
  viewMode,
  selectedLibraryId,
  selectedView,
  canCreateArticle,
  onCreateArticle,
}: Props) {
  const isEmpty =
    folders.length === 0 && knowledgeSources.length === 0;

  if (isEmpty) {
    if (selectedView === "shared") {
      return (
        <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 text-center">
          <div className="max-w-md">
            <p className="font-medium text-foreground">
              No hay contenido compartido
            </p>

            <p className="mt-1 text-sm text-muted-foreground">
              Las bibliotecas compartidas contigo aparecerán aquí.
            </p>
          </div>
        </div>
      );
    }

    if (selectedLibraryId && canCreateArticle) {
      return (
        <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 text-center">
          <div className="max-w-md">
            <p className="font-medium text-foreground">
              Esta carpeta está vacía
            </p>

            <p className="mt-1 text-sm text-muted-foreground">
              Crea el primer artículo de conocimiento dentro de esta
              carpeta.
            </p>

            <button
              type="button"
              onClick={onCreateArticle}
              className="mt-5 inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Nuevo artículo
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 text-center">
        <p className="text-sm text-muted-foreground">
          No hay contenido disponible.
        </p>
      </div>
    );
  }

  if (viewMode === "list") {
    return (
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="grid grid-cols-[minmax(260px,1fr)_180px_140px_150px] border-b border-border px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <div>Nombre</div>
          <div>Contenido</div>
          <div>Tipo</div>
          <div>Actualización</div>
        </div>

        <div className="divide-y divide-border">
          {folders.map((folder) => (
            <Link
              key={folder.id}
              href={`/knowledge?library=${folder.id}`}
              className="grid grid-cols-[minmax(260px,1fr)_180px_140px_150px] items-center px-4 py-3 text-sm hover:bg-surface"
            >
              <div className="flex min-w-0 items-center gap-3 font-medium text-foreground">
                {getFolderIcon(folder)}

                <span className="truncate">{folder.name}</span>
              </div>

              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <FileText className="h-3.5 w-3.5" />
                  {folder.article_count ?? 0}
                </span>

                <span className="flex items-center gap-1">
                  <FileStack className="h-3.5 w-3.5" />
                  {folder.file_count ?? 0}
                </span>

                <span className="flex items-center gap-1">
                  <FolderTree className="h-3.5 w-3.5" />
                  {folder.folder_count ?? 0}
                </span>
              </div>

              <div className="text-muted-foreground">
                {folder.is_shared ? "Compartida" : "Carpeta"}
              </div>

              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                {formatRelativeDate(folder.updated_at)}
              </div>
            </Link>
          ))}

          {knowledgeSources.map((knowledge) => (
            <Link
              key={knowledge.id}
              href={`/knowledge/${knowledge.id}`}
              className="grid grid-cols-[minmax(260px,1fr)_180px_140px_150px] items-center px-4 py-3 text-sm hover:bg-surface"
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

                  {getSummary(knowledge) ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {getSummary(knowledge)}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="truncate text-muted-foreground">
                {knowledge.domain ?? "—"}
              </div>

              <div className="text-muted-foreground">
                {getStatusLabel(knowledge.status)}
              </div>

              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                {formatRelativeDate(knowledge.updated_at)}
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

        return (
          <KnowledgeFolderCard
            key={folder.id}
            folder={folder}
          />
        );
      })}

      {knowledgeSources.map((knowledge) => (
        <KnowledgeCard
          key={knowledge.id}
          knowledge={knowledge}
        />
      ))}
    </div>
  );
}