// components/knowledge/content/cards/knowledge-item-card.tsx

"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useEffect,
  useState,
  type DragEvent,
} from "react";
import {
  Clock,
  FileText,
} from "lucide-react";

import { KnowledgeTypeBadge } from "@/components/knowledge/content/knowledge-type-badge";
import { Card, CardContent } from "@/components/ui/card";

import { KnowledgeCardMenu } from "./article/knowledge-card-menu";
import { useKnowledgeCardActions } from "./article/use-knowledge-card-actions";
import { KnowledgeFolderMenu } from "./folder/knowledge-folder-menu";
import { useKnowledgeFolderActions } from "./folder/use-knowledge-folder-actions";
import { CardSelectionCheckbox } from "./shared/card-selection-checkbox";
import { ExpandableCardFooter } from "./shared/expandable-card-footer";
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

export type KnowledgeItemCardProps =
  | FolderProps
  | ArticleProps;

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

  const actions = useKnowledgeFolderActions({
    folder,
  });

  const isSelected = selected;
  const articleCount = folder.article_count ?? 0;
  const folderCount = folder.folder_count ?? 0;

  useEffect(() => {
    setRelativeUpdatedAt(
      formatRelativeDate(folder.updated_at),
    );
  }, [folder.updated_at]);

  return (
    <KnowledgeItemCardShell
      selected={isSelected}
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
          selected={isSelected}
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
        <Image
          src="/icons/files/folder.png"
          alt=""
          width={120}
          height={120}
          className="h-[120px] w-[120px] object-contain transition-transform duration-200 group-hover:scale-[1.03]"
        />
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
                actions.setRenameValue(
                  event.target.value,
                );
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
            className="block w-full truncate text-sm font-semibold leading-5 text-foreground"
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
        <span className="flex shrink-0 items-center gap-1">
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
  const actions = useKnowledgeCardActions({
    knowledge,
  });

  const isSelected = selected;

  return (
    <KnowledgeItemCardShell
      selected={isSelected}
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
          selected={isSelected}
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
        <div className="flex h-[120px] w-[120px] items-center justify-center rounded-2xl bg-lesson-soft text-lesson transition-transform duration-200 group-hover:scale-[1.03]">
          <FileText
            className="h-16 w-16"
            strokeWidth={1.5}
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
            className="block w-full truncate text-sm font-semibold leading-5 text-foreground hover:text-lesson"
          >
            {knowledge.title}
          </h2>
        </Link>
      }
      leftMeta={
        <div className="min-w-0 overflow-hidden">
          <KnowledgeTypeBadge
            type={knowledge.knowledge_type}
            confidence={knowledge.confidence}
          />
        </div>
      }
      rightMeta={
        <span className="flex shrink-0 items-center gap-1">
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
  selectionControl: React.ReactNode;
  menu: React.ReactNode;
  preview: React.ReactNode;
  title: React.ReactNode;
  leftMeta: React.ReactNode;
  rightMeta: React.ReactNode;
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
    "group relative h-[300px] self-start cursor-pointer overflow-hidden border-border bg-card transition",
    "hover:border-cyan-200 hover:shadow-md",
    isDropTarget
      ? "border-primary ring-2 ring-primary ring-offset-2 ring-offset-background"
      : "",
    selected && !isDropTarget
      ? "border-primary ring-2 ring-primary/20"
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
<CardContent className="flex h-full flex-col p-0">
  <div className="relative flex h-[190px] shrink-0 items-center justify-center bg-card px-6">
    <div
      className={[
        "absolute left-2.5 top-2.5 z-30 transition",
        selected
          ? "opacity-100"
          : "opacity-0 group-hover:opacity-100",
      ].join(" ")}
    >
      {selectionControl}
    </div>

    <div
      className="absolute right-2.5 top-2.5 z-30 opacity-0 transition group-hover:opacity-100"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {menu}
    </div>

    {preview}
  </div>

<ExpandableCardFooter>
  <div className="flex h-full min-w-0 flex-col justify-center gap-3 px-4 py-3">
    <div className="min-w-0">
      {title}
    </div>

    <div className="flex min-w-0 items-center justify-between gap-3 text-xs text-muted-foreground">
      <div className="min-w-0">
        {leftMeta}
      </div>

      {rightMeta}
    </div>
  </div>
</ExpandableCardFooter>

</CardContent>
    </Card>
  );
}