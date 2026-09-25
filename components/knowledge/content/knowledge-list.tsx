// components/knowledge/content/knowledge-list.tsx

"use client";

import type { DragEvent } from "react";
import Link from "next/link";
import {
  Clock3,
  Ellipsis,
  FileStack,
  FileText,
  Folder,
  FolderTree,
  UsersRound,
} from "lucide-react";

import { getKnowledgeTypeVisualStyle } from "./cards/shared/knowledge-type-style";
import { cn } from "@/lib/utils";

export type KnowledgeListFolder = {
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

export type KnowledgeListSource = {
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
  folders: KnowledgeListFolder[];
  knowledgeSources: KnowledgeListSource[];
  isMoving: boolean;
  dropTargetFolderId: string | null;

  onFolderDragStart: (
    folder: KnowledgeListFolder,
    event: DragEvent<HTMLElement>,
  ) => void;

  onArticleDragStart: (
    knowledge: KnowledgeListSource,
    event: DragEvent<HTMLElement>,
  ) => void;

  onDragEnd: () => void;

  onFolderDragOver: (
    folder: KnowledgeListFolder,
    event: DragEvent<HTMLElement>,
  ) => void;

  onFolderDragLeave: (
    folderId: string,
    event: DragEvent<HTMLElement>,
  ) => void;

  onFolderDrop: (
    folder: KnowledgeListFolder,
    event: DragEvent<HTMLElement>,
  ) => void;
};

function getSummary(
  knowledge: KnowledgeListSource,
) {
  return (
    knowledge.summary?.trim() ||
    knowledge.description?.trim() ||
    knowledge.content?.trim() ||
    ""
  );
}

function formatRelativeDate(
  date: Date | string | null | undefined,
) {
  if (!date) {
    return "Sin fecha";
  }

  const timestamp = new Date(date).getTime();

  const diffMinutes = Math.max(
    1,
    Math.floor(
      (Date.now() - timestamp) / 60000,
    ),
  );

  if (diffMinutes < 60) {
    return `Hace ${diffMinutes} min`;
  }

  const diffHours = Math.floor(
    diffMinutes / 60,
  );

  if (diffHours < 24) {
    return `Hace ${diffHours} h`;
  }

  const diffDays = Math.floor(
    diffHours / 24,
  );

  if (diffDays < 30) {
    return `Hace ${diffDays} días`;
  }

  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

function FolderListIcon({
  shared = false,
}: {
  shared?: boolean;
}) {
  const Icon = shared
    ? UsersRound
    : Folder;

  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E3ECFF] text-[#0057FF]">
      <Icon
        className="h-5 w-5"
        strokeWidth={2.2}
      />
    </span>
  );
}

function ArticleListIcon({
  type,
}: {
  type?: string | null;
}) {
  const style =
    getKnowledgeTypeVisualStyle(type);

  const Icon = style.Icon;

  return (
    <span
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
        style.iconBackgroundClassName,
        style.iconClassName,
      )}
    >
      <Icon
        className="h-5 w-5"
        strokeWidth={2.2}
      />
    </span>
  );
}

function FolderTypeBadge({
  shared = false,
}: {
  shared?: boolean;
}) {
  return (
    <span className="inline-flex h-6 items-center rounded-md bg-[#EAF1FF] px-2.5 text-[11px] font-semibold leading-none text-[#0057FF]">
      {shared
        ? "Compartida"
        : "Carpeta"}
    </span>
  );
}

function KnowledgeTypeListBadge({
  type,
}: {
  type?: string | null;
}) {
  const style =
    getKnowledgeTypeVisualStyle(type);

  return (
    <span
      className={cn(
        "inline-flex h-6 max-w-full items-center rounded-md border px-2.5 text-[11px] font-semibold leading-none",
        style.badgeClassName,
      )}
    >
      <span className="truncate">
        {style.label}
      </span>
    </span>
  );
}

function RowMenuButton() {
  return (
    <button
      type="button"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-0 bg-transparent text-slate-400 shadow-none outline-none transition-colors duration-150 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
      aria-label="Más opciones"
      title="Más opciones"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <Ellipsis
        className="h-[18px] w-[18px]"
        strokeWidth={2.2}
      />
    </button>
  );
}

function KnowledgeListHeader() {
  return (
    <div className="grid shrink-0 grid-cols-[minmax(360px,1fr)_180px_170px_160px_40px] items-center border-b border-slate-200/90 bg-white px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.035em] text-slate-500">
      <div>Nombre</div>
      <div>Contenido</div>
      <div>Tipo</div>
      <div>Actualización</div>
      <div />
    </div>
  );
}

type FolderRowProps = {
  folder: KnowledgeListFolder;
  isMoving: boolean;
  isDropTarget: boolean;

  onDragStart: (
    event: DragEvent<HTMLElement>,
  ) => void;

  onDragEnd: () => void;

  onDragOver: (
    event: DragEvent<HTMLElement>,
  ) => void;

  onDragLeave: (
    event: DragEvent<HTMLElement>,
  ) => void;

  onDrop: (
    event: DragEvent<HTMLElement>,
  ) => void;
};

function KnowledgeFolderListRow({
  folder,
  isMoving,
  isDropTarget,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: FolderRowProps) {
  return (
    <div
      draggable={
        !folder.is_shared &&
        !isMoving
      }
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "group relative border-b border-slate-200/80 transition-colors duration-150 last:border-b-0",
        isDropTarget
          ? "bg-[#0A58FF]/[0.06]"
          : "bg-white hover:bg-slate-50/70",
      )}
    >
      <Link
        href={`/knowledge?library=${folder.id}`}
        className="grid min-h-[60px] grid-cols-[minmax(360px,1fr)_180px_170px_160px_40px] items-center px-5"
      >
        <div className="flex min-w-0 items-center gap-3">
          <FolderListIcon
            shared={folder.is_shared}
          />

          <span className="min-w-0 truncate text-[13px] font-semibold tracking-[-0.01em] text-slate-950">
            {folder.name}
          </span>
        </div>

        <div className="flex min-w-0 items-center gap-3 text-[12px] text-slate-500">
          <span
            className="flex shrink-0 items-center gap-1"
            title="Artículos"
          >
            <FileText className="h-3.5 w-3.5" />
            {folder.article_count ?? 0}
          </span>

          <span
            className="flex shrink-0 items-center gap-1"
            title="Archivos"
          >
            <FileStack className="h-3.5 w-3.5" />
            {folder.file_count ?? 0}
          </span>

          <span
            className="flex shrink-0 items-center gap-1"
            title="Subcarpetas"
          >
            <FolderTree className="h-3.5 w-3.5" />
            {folder.folder_count ?? 0}
          </span>
        </div>

        <div className="min-w-0">
          <FolderTypeBadge
            shared={folder.is_shared}
          />
        </div>

        <div className="flex min-w-0 items-center gap-1.5 text-[12px] text-slate-500">
          <Clock3
            className="h-3.5 w-3.5 shrink-0"
            strokeWidth={2}
          />

          <span className="truncate">
            {formatRelativeDate(
              folder.updated_at,
            )}
          </span>
        </div>

        <div className="flex justify-end">
          <RowMenuButton />
        </div>
      </Link>
    </div>
  );
}

type ArticleRowProps = {
  knowledge: KnowledgeListSource;
  isMoving: boolean;

  onDragStart: (
    event: DragEvent<HTMLElement>,
  ) => void;

  onDragEnd: () => void;
};

function KnowledgeArticleListRow({
  knowledge,
  isMoving,
  onDragStart,
  onDragEnd,
}: ArticleRowProps) {
  const summary =
    getSummary(knowledge);

  return (
    <div
      draggable={!isMoving}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="group relative border-b border-slate-200/80 bg-white transition-colors duration-150 last:border-b-0 hover:bg-slate-50/70"
    >
      <Link
        href={`/knowledge/${knowledge.id}`}
        className="grid min-h-[68px] grid-cols-[minmax(360px,1fr)_180px_170px_160px_40px] items-center px-5"
      >
        <div className="flex min-w-0 items-center gap-3">
          <ArticleListIcon
            type={
              knowledge.knowledge_type
            }
          />

          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold leading-[18px] tracking-[-0.01em] text-slate-950">
              {knowledge.title}
            </p>

            {summary ? (
              <p className="mt-0.5 truncate text-[11px] leading-[16px] text-slate-500">
                {summary}
              </p>
            ) : null}
          </div>
        </div>

        <div className="min-w-0">
          <span className="block truncate text-[12px] text-slate-500">
            {knowledge.domain ?? "—"}
          </span>
        </div>

        <div className="min-w-0">
          <KnowledgeTypeListBadge
            type={
              knowledge.knowledge_type
            }
          />
        </div>

        <div className="flex min-w-0 items-center gap-1.5 text-[12px] text-slate-500">
          <Clock3
            className="h-3.5 w-3.5 shrink-0"
            strokeWidth={2}
          />

          <span className="truncate">
            {formatRelativeDate(
              knowledge.updated_at,
            )}
          </span>
        </div>

        <div className="flex justify-end">
          <RowMenuButton />
        </div>
      </Link>
    </div>
  );
}

export function KnowledgeList({
  folders,
  knowledgeSources,
  isMoving,
  dropTargetFolderId,
  onFolderDragStart,
  onArticleDragStart,
  onDragEnd,
  onFolderDragOver,
  onFolderDragLeave,
  onFolderDrop,
}: Props) {
  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-white">
      <KnowledgeListHeader />

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-10">
        {folders.map((folder) => (
          <KnowledgeFolderListRow
            key={folder.id}
            folder={folder}
            isMoving={isMoving}
            isDropTarget={
              dropTargetFolderId ===
              folder.id
            }
            onDragStart={(event) =>
              onFolderDragStart(
                folder,
                event,
              )
            }
            onDragEnd={onDragEnd}
            onDragOver={(event) =>
              onFolderDragOver(
                folder,
                event,
              )
            }
            onDragLeave={(event) =>
              onFolderDragLeave(
                folder.id,
                event,
              )
            }
            onDrop={(event) =>
              onFolderDrop(
                folder,
                event,
              )
            }
          />
        ))}

        {knowledgeSources.map(
          (knowledge) => (
            <KnowledgeArticleListRow
              key={knowledge.id}
              knowledge={knowledge}
              isMoving={isMoving}
              onDragStart={(event) =>
                onArticleDragStart(
                  knowledge,
                  event,
                )
              }
              onDragEnd={onDragEnd}
            />
          ),
        )}
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-12 bg-gradient-to-b from-white/0 via-white/75 to-white"
      />
    </div>
  );
}