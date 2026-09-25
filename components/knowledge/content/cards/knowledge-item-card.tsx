// components/knowledge/content/cards/knowledge-item-card.tsx

"use client";

import {
  Clock,
  Folder,
} from "lucide-react";
import {
  useEffect,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { AppGridCard } from "@/components/app/layouts/app-grid-card";
import { KnowledgeTypeBadge } from "@/components/knowledge/content/knowledge-type-badge";

import { KnowledgeCardMenu } from "./article/knowledge-card-menu";
import { useKnowledgeCardActions } from "./article/use-knowledge-card-actions";
import { KnowledgeFolderMenu } from "./folder/knowledge-folder-menu";
import { useKnowledgeFolderActions } from "./folder/use-knowledge-folder-actions";
import { KnowledgeItemCardBody } from "./knowledge-item-card-body";
import { KnowledgeItemCardFooter } from "./knowledge-item-card-footer";
import { CardSelectionCheckbox } from "./shared/card-selection-checkbox";
import {
  formatRelativeDate,
  getCountLabel,
} from "./shared/card-utils";
import { getKnowledgeTypeVisualStyle } from "./shared/knowledge-type-style";

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
  onDragStart?: (
    event: DragEvent<HTMLElement>,
  ) => void;
  onDragEnd?: (
    event: DragEvent<HTMLElement>,
  ) => void;
  onDragOver?: (
    event: DragEvent<HTMLElement>,
  ) => void;
  onDragLeave?: (
    event: DragEvent<HTMLElement>,
  ) => void;
  onDrop?: (
    event: DragEvent<HTMLElement>,
  ) => void;
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
  onShare?: (
    knowledge: KnowledgeSource,
  ) => void;
};

export type KnowledgeItemCardProps =
  | FolderProps
  | ArticleProps;

export function KnowledgeItemCard(
  props: KnowledgeItemCardProps,
) {
  if (props.itemType === "folder") {
    return (
      <KnowledgeFolderItemCard {...props} />
    );
  }

  return (
    <KnowledgeArticleItemCard {...props} />
  );
}

/* -------------------------------------------------------------------------- */
/*                                   FOLDER                                   */
/* -------------------------------------------------------------------------- */

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

  const actions =
    useKnowledgeFolderActions({
      folder,
    });

  const articleCount =
    folder.article_count ?? 0;

  const folderCount =
    folder.folder_count ?? 0;

  useEffect(() => {
    setRelativeUpdatedAt(
      formatRelativeDate(
        folder.updated_at,
      ),
    );
  }, [folder.updated_at]);

  const contentLabel = [
    getCountLabel(
      articleCount,
      "artículo",
      "artículos",
    ),
    folderCount > 0
      ? getCountLabel(
          folderCount,
          "subcarpeta",
          "subcarpetas",
        )
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

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
          onSelectedChange={
            onSelectedChange
          }
        />
      }
      menu={
        <KnowledgeFolderMenu
          folder={folder}
          isDeleting={
            actions.isDeleting
          }
          onOpen={
            actions.openFolder
          }
          onRename={
            actions.openRename
          }
          onDelete={
            actions.deleteFolder
          }
        />
      }
icon={
  <div
    className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-[#E3ECFF] text-[#0057FF]"
    style={{
      width: "64px",
      height: "64px",
      minWidth: "64px",
      minHeight: "64px",
    }}
  >
    <Folder
      className="size-8"
      width={32}
      height={32}
      strokeWidth={2.2}
    />
  </div>
}
      title={
        actions.isRenaming ? (
          <div
            className="flex min-w-0 items-center gap-1.5"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            <input
              autoFocus
              value={
                actions.renameValue
              }
              disabled={
                actions.isRenamingPending
              }
              onChange={(event) => {
                actions.setRenameValue(
                  event.target.value,
                );
              }}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter"
                ) {
                  actions.saveRename();
                }

                if (
                  event.key === "Escape"
                ) {
                  actions.cancelRename();
                }
              }}
              className="h-7 min-w-0 flex-1 rounded-md border border-[#0A58FF] bg-white px-2 text-xs font-semibold text-slate-950 outline-none ring-2 ring-[#0A58FF]/10"
            />

            <button
              type="button"
              disabled={
                actions.isRenamingPending
              }
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                actions.saveRename();
              }}
              className="h-7 shrink-0 rounded-md bg-[#0A58FF] px-2 text-[10px] font-semibold text-white disabled:opacity-50"
            >
              {actions.isRenamingPending
                ? "..."
                : "Guardar"}
            </button>
          </div>
        ) : (
          <h2
            title={folder.name}
            className="truncate text-[13px] font-semibold leading-[18px] tracking-[-0.01em] text-slate-950 "
          >
            {folder.name}
          </h2>
        )
      }
      description={
        <p
          title={contentLabel}
          className="truncate text-[11px] leading-4 text-slate-500"
        >
          {contentLabel}
        </p>
      }
      footerLeft={
        <CardDate>
          {relativeUpdatedAt}
        </CardDate>
      }
    />
  );
}

/* -------------------------------------------------------------------------- */
/*                                   ARTICLE                                  */
/* -------------------------------------------------------------------------- */

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
  const actions =
    useKnowledgeCardActions({
      knowledge,
    });

  const typeStyle =
    getKnowledgeTypeVisualStyle(
      knowledge.knowledge_type,
    );

  const TypeIcon = typeStyle.Icon;

  const description =
    knowledge.summary?.trim() ||
    knowledge.description?.trim() ||
    knowledge.domain?.trim() ||
    null;

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
          onSelectedChange={
            onSelectedChange
          }
        />
      }
      menu={
        <KnowledgeCardMenu
          knowledge={knowledge}
          visibility={
            actions.visibility
          }
          processing={
            actions.processing
          }
          isDeleting={
            actions.isDeleting
          }
          isUpdatingVisibility={
            actions.isUpdatingVisibility
          }
          onOpen={
            actions.openArticle
          }
          onReprocess={
            actions.reprocess
          }
          onDelete={
            actions.deleteArticle
          }
          onVisibilityChange={
            actions.changeVisibility
          }
          onShare={
            onShare
              ? () =>
                  onShare(knowledge)
              : undefined
          }
        />
      }
icon={
  <div
    className={[
      "flex size-16 shrink-0 items-center justify-center rounded-2xl",
      typeStyle.iconBackgroundClassName,
      typeStyle.iconClassName,
    ].join(" ")}
    style={{
      width: "64px",
      height: "64px",
      minWidth: "64px",
      minHeight: "64px",
    }}
  >
    <TypeIcon
      className="size-8"
      width={32}
      height={32}
      strokeWidth={2.2}
    />
  </div>
}
      title={
        <h2
          title={knowledge.title}
          className="truncate text-[13px] font-semibold leading-[18px] tracking-[-0.01em] text-slate-950 "
        >
          {knowledge.title}
        </h2>
      }
      description={
        description ? (
          <p
            title={description}
            className="truncate text-[11px] leading-4 text-slate-500"
          >
            {description}
          </p>
        ) : undefined
      }
badges={
  <KnowledgeTypeBadge
    type={knowledge.knowledge_type}
  />
}
footerLeft={
  <CardDate>
    {formatRelativeDate(
      knowledge.updated_at,
      "Sin actualizar",
    )}
  </CardDate>
}
footerRight={
  <KnowledgeAIConfidence
    confidence={knowledge.confidence}
  />
}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*                                  CARD DATE                                 */
/* -------------------------------------------------------------------------- */

function CardDate({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Clock
        className="h-3 w-3 shrink-0 text-slate-400"
        strokeWidth={1.9}
      />

      <span className="truncate">
        {children}
      </span>
    </span>
  );
}

function KnowledgeAIConfidence({
  confidence,
}: {
  confidence?: number | null;
}) {
  if (
    confidence === null ||
    confidence === undefined
  ) {
    return null;
  }

  const percentage =
    confidence <= 1
      ? Math.round(confidence * 100)
      : Math.round(confidence);

  const normalizedPercentage = Math.min(
    100,
    Math.max(0, percentage),
  );

  return (
    <span className="whitespace-nowrap text-[10px] font-semibold text-[#00A86B]">
      IA {normalizedPercentage}%
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*                                    SHELL                                   */
/* -------------------------------------------------------------------------- */

type ShellProps = {
  selected: boolean;
  draggable: boolean;
  isDropTarget: boolean;
  onClick: () => void;
  onDragStart?: (
    event: DragEvent<HTMLElement>,
  ) => void;
  onDragEnd?: (
    event: DragEvent<HTMLElement>,
  ) => void;
  onDragOver?: (
    event: DragEvent<HTMLElement>,
  ) => void;
  onDragLeave?: (
    event: DragEvent<HTMLElement>,
  ) => void;
  onDrop?: (
    event: DragEvent<HTMLElement>,
  ) => void;
  selectionControl: ReactNode;
  menu: ReactNode;
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  badges?: ReactNode;
  footerLeft?: ReactNode;
  footerRight?: ReactNode;
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
  icon,
  title,
  description,
  badges,
  footerLeft,
  footerRight,
}: ShellProps) {
  function handleOpen() {
    onClick();
  }

  function handleOpenKeyDown(
    event: KeyboardEvent<HTMLDivElement>,
  ) {
    if (
      event.key === "Enter" ||
      event.key === " "
    ) {
      event.preventDefault();
      handleOpen();
    }
  }

  return (
    <AppGridCard
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={[
        "group relative flex w-full min-w-0 flex-col overflow-hidden",
        "rounded-xl border border-slate-200/90 bg-white",
        "transition-[border-color,background-color] duration-150",
        "hover:!border-[#0A58FF]/35",
        isDropTarget
          ? "!border-[#0A58FF] bg-[#0A58FF]/[0.025]"
          : "",
        selected &&
        !isDropTarget
          ? "!border-[#0A58FF]/60 bg-[#0A58FF]/[0.025]"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Selección */}
      <div
        className={[
          "absolute left-3 top-3 z-20",
          "transition-opacity duration-150",
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

      {/* Menú */}
      <div
        className="absolute right-2 top-2 z-20 flex h-6 w-6 items-center justify-center [&_button]:!border-0 [&_button]:!bg-transparent [&_button]:!shadow-none [&_button]:!ring-0 [&_button]:!ring-offset-0"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        {menu}
      </div>

<div
  role="button"
  tabIndex={0}
  onClick={handleOpen}
  onKeyDown={handleOpenKeyDown}
  className="group/open flex h-full min-h-0 min-w-0 flex-1 cursor-pointer flex-col px-3.5 py-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0A58FF]/35"
>
  <KnowledgeItemCardBody
    icon={icon}
    title={title}
    description={description}
    badges={badges}
  />

  <KnowledgeItemCardFooter
    left={footerLeft}
    right={footerRight}
  />
</div>
    </AppGridCard>
  );
}