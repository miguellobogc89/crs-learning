// components/knowledge/content/cards/knowledge-item-card.tsx

// components/knowledge/content/cards/knowledge-item-card.tsx

"use client";

import Link from "next/link";
import {
  useEffect,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import { Clock, FileText, Folder } from "lucide-react";

import { KnowledgeTypeBadge } from "@/components/knowledge/content/knowledge-type-badge";
import { Card, CardContent } from "@/components/ui/card";

import { KnowledgeCardMenu } from "./article/knowledge-card-menu";
import { useKnowledgeCardActions } from "./article/use-knowledge-card-actions";
import { KnowledgeFolderMenu } from "./folder/knowledge-folder-menu";
import { useKnowledgeFolderActions } from "./folder/use-knowledge-folder-actions";
import { CardSelectionCheckbox } from "./shared/card-selection-checkbox";
import { KnowledgeCardHeader } from "./knowledge-card-header";
import {
  formatRelativeDate,
  getCountLabel,
} from "./shared/card-utils";

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

type SharedProps = {
  selected: boolean;
  onSelectedChange: (selected: boolean) => void;
  draggable?: boolean;
  isDropTarget?: boolean;
  onDragStart?: (event: DragEvent<HTMLElement>) => void;
  onDragEnd?: (event: DragEvent<HTMLElement>) => void;
  onDragOver?: (event: DragEvent<HTMLElement>) => void;
  onDragLeave?: (event: DragEvent<HTMLElement>) => void;
  onDrop?: (event: DragEvent<HTMLElement>) => void;
};

type FolderProps = SharedProps & {
  itemType: "folder";
  folder: KnowledgeLibrary;
  knowledge?: never;
  onShare?: never;
};

type ArticleProps = SharedProps & {
  itemType: "article";
  knowledge: KnowledgeSource;
  folder?: never;
  onShare?: (knowledge: KnowledgeSource) => void;
};

export type KnowledgeItemCardProps = FolderProps | ArticleProps;

export function KnowledgeItemCard(
  props: KnowledgeItemCardProps,
) {
  if (props.itemType === "folder") {
    return <KnowledgeFolderItemCard {...props} />;
  }

  return <KnowledgeArticleItemCard {...props} />;
}

function KnowledgeFolderItemCard({
  folder,
  selected,
  onSelectedChange,
  draggable = false,
  isDropTarget = false,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: FolderProps) {
  const [relativeUpdatedAt, setRelativeUpdatedAt] =
    useState("—");

  const actions = useKnowledgeFolderActions({ folder });

  const articleCount = folder.article_count ?? 0;
  const folderCount = folder.folder_count ?? 0;

  useEffect(() => {
    setRelativeUpdatedAt(
      formatRelativeDate(folder.updated_at),
    );
  }, [folder.updated_at]);

  return (
    <KnowledgeItemCardShell
      selected={selected}
      draggable={draggable}
      isDropTarget={isDropTarget}
      onClick={actions.openFolder}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      selectionControl={
        <CardSelectionCheckbox
          selected={selected}
          label={`Seleccionar ${folder.name}`}
          onSelectedChange={onSelectedChange}
        />
      }
      menu={
        <KnowledgeFolderMenu
          folder={folder}
          isDeleting={actions.isDeleting}
          onOpen={actions.openFolder}
          onRename={actions.openRename}
          onDelete={actions.deleteFolder}
        />
      }
preview={
  <div className="flex h-[108px] w-[108px] items-center justify-center rounded-[20px] bg-lesson-soft text-lesson transition-transform duration-200 group-hover:scale-[1.04]">
    <Folder size={52} strokeWidth={1.8} />
  </div>
}
      title={
        actions.isRenaming ? (
          <div
            className="flex min-w-0 items-center gap-2"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            <input
              autoFocus
              value={actions.renameValue}
              disabled={actions.isRenamingPending}
              onChange={(event) => {
                actions.setRenameValue(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  actions.saveRename();
                }

                if (event.key === "Escape") {
                  actions.cancelRename();
                }
              }}
              className="h-8 min-w-0 flex-1 rounded-md border border-primary bg-background px-2 text-sm font-semibold text-foreground outline-none ring-2 ring-primary/20"
            />

            <button
              type="button"
              disabled={actions.isRenamingPending}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                actions.saveRename();
              }}
              className="h-8 shrink-0 rounded-md bg-primary px-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              {actions.isRenamingPending
                ? "Guardando..."
                : "Guardar"}
            </button>
          </div>
        ) : (
          <h2
            title={folder.name}
            className="line-clamp-2 text-[15px] font-semibold leading-[22px] tracking-[-0.01em] text-foreground"
          >
            {folder.name}
          </h2>
        )
      }
      leftMeta={
        <span className="block min-w-0 truncate">
          {getCountLabel(
            articleCount,
            "artículo",
            "artículos",
          )}
          {folderCount > 0
            ? ` · ${getCountLabel(
                folderCount,
                "subcarpeta",
                "subcarpetas",
              )}`
            : ""}
        </span>
      }
      rightMeta={
        <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap">
          <Clock className="h-3.5 w-3.5" />
          {relativeUpdatedAt}
        </span>
      }
    />
  );
}

function KnowledgeArticleItemCard({
  knowledge,
  selected,
  onSelectedChange,
  onShare,
  draggable = false,
  isDropTarget = false,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: ArticleProps) {
  const actions = useKnowledgeCardActions({ knowledge });

  return (
    <KnowledgeItemCardShell
      selected={selected}
      draggable={draggable}
      isDropTarget={isDropTarget}
      onClick={actions.openArticle}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      selectionControl={
        <CardSelectionCheckbox
          selected={selected}
          label={`Seleccionar ${knowledge.title}`}
          onSelectedChange={onSelectedChange}
        />
      }
      menu={
        <KnowledgeCardMenu
          knowledge={knowledge}
          visibility={actions.visibility}
          processing={actions.processing}
          isDeleting={actions.isDeleting}
          isUpdatingVisibility={
            actions.isUpdatingVisibility
          }
          onOpen={actions.openArticle}
          onReprocess={actions.reprocess}
          onDelete={actions.deleteArticle}
          onVisibilityChange={
            actions.changeVisibility
          }
          onShare={
            onShare
              ? () => onShare(knowledge)
              : undefined
          }
        />
      }
      preview={
        <div className="flex h-[108px] w-[108px] items-center justify-center rounded-[20px] bg-lesson-soft text-lesson transition-transform duration-200 group-hover:scale-[1.04]">
          <FileText
            className="h-14 w-14"
            strokeWidth={1.6}
          />
        </div>
      }
      title={
        <Link
          href={actions.articleUrl}
          onClick={(event) => {
            event.stopPropagation();
          }}
          className="block min-w-0 max-w-full"
        >
          <h2
            title={knowledge.title}
            className="line-clamp-2 text-[15px] font-semibold leading-[22px] tracking-[-0.01em] text-foreground transition-colors hover:text-lesson"
          >
            {knowledge.title}
          </h2>
        </Link>
      }
      leftMeta={
        <div className="min-w-0">
          <KnowledgeTypeBadge
            type={knowledge.knowledge_type}
            confidence={knowledge.confidence}
          />
        </div>
      }
      rightMeta={
        <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap">
          <Clock className="h-3.5 w-3.5" />
          {formatRelativeDate(
            knowledge.updated_at,
            "Sin actualizar",
          )}
        </span>
      }
    />
  );
}

type ShellProps = {
  selected: boolean;
  draggable: boolean;
  isDropTarget: boolean;
  onClick: () => void;
  onDragStart?: (event: DragEvent<HTMLElement>) => void;
  onDragEnd?: (event: DragEvent<HTMLElement>) => void;
  onDragOver?: (event: DragEvent<HTMLElement>) => void;
  onDragLeave?: (event: DragEvent<HTMLElement>) => void;
  onDrop?: (event: DragEvent<HTMLElement>) => void;
  selectionControl: ReactNode;
  menu: ReactNode;
  preview: ReactNode;
  title: ReactNode;
  leftMeta: ReactNode;
  rightMeta: ReactNode;
};




function KnowledgeItemCardShell({
  selected,
  draggable,
  isDropTarget,
  onClick,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  selectionControl,
  menu,
  preview,
  title,
  leftMeta,
  rightMeta,
}: ShellProps) {
  const cardClassName = [
    // Neutralizamos el padding y el gap internos que Card añade por defecto.
    // Esta es la corrección que ha permitido cuadrar el diseño.
    "group h-[280px] min-w-0 overflow-hidden !gap-0 !py-0",
    "border border-slate-200/50 bg-card",

    // Resplandor azul y elevación suave que ya habíamos aprobado.
    "shadow-[0_4px_24px_-8px_rgba(59,130,246,0.16),0_12px_48px_-18px_rgba(59,130,246,0.14)]",
    "transform-gpu transition-[transform,box-shadow] duration-500 ease-out",
    "hover:-translate-y-[2px]",
    "hover:shadow-[0_6px_30px_-8px_rgba(59,130,246,0.24),0_18px_56px_-16px_rgba(59,130,246,0.22)]",

    isDropTarget
      ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
      : "",

    selected && !isDropTarget
      ? "ring-2 ring-primary/20"
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Card
      draggable={draggable}
      className={cardClassName}
      onClick={onClick}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Conservamos el padding único que ya ha quedado bien. */}
      <CardContent className="flex h-full min-h-0 flex-col !p-4">
        {/* HEADER */}
        <header className="flex h-8 shrink-0 items-center justify-between">
          <div
            className={[
              "flex h-7 w-7 shrink-0 items-center justify-center",
              "transition-opacity duration-200",
              selected
                ? "opacity-100"
                : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
            ].join(" ")}
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            {selectionControl}
          </div>

          <div
            className={[
              "flex h-7 w-7 shrink-0 items-center justify-center",
              "[&_button]:!border-0",
              "[&_button]:!bg-transparent",
              "[&_button]:!shadow-none",
              "[&_button]:!ring-0",
              "[&_button]:!ring-offset-0",
            ].join(" ")}
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            {menu}
          </div>
        </header>

        {/* BODY: icono real de carpeta o artículo */}
        <div className="flex h-[124px] shrink-0 items-center justify-center">
          {preview}
        </div>

        {/* FOOTER: título y metadatos reales */}
        <footer className="flex min-h-0 flex-1 flex-col pt-2">
          <div className="min-w-0">
            {title}
          </div>

          <div className="mt-auto flex min-w-0 items-end justify-between gap-2 text-xs text-muted-foreground">
            <div className="min-w-0 flex-1">
              {leftMeta}
            </div>

            <div className="shrink-0 text-right">
              {rightMeta}
            </div>
          </div>
        </footer>
      </CardContent>
    </Card>
  );
}