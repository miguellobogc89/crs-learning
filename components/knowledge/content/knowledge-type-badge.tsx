// components/knowledge/content/knowledge-type-badge.tsx

"use client";

import { cn } from "@/lib/utils";
import { getKnowledgeTypeVisualStyle } from "@/components/knowledge/content/cards/shared/knowledge-type-style";

type Props = {
  type?: string | null;
  confidence?: number | null;
};

export function KnowledgeTypeBadge({
  type,
}: Props) {
  const style =
    getKnowledgeTypeVisualStyle(type);

  return (
    <span
      className={cn(
        "inline-flex h-[18px] min-w-0 items-center rounded-[5px] border px-1.5",
        "text-[9px] font-semibold leading-none",
        style.badgeClassName,
      )}
    >
      <span className="truncate">
        {style.label}
      </span>
    </span>
  );
}