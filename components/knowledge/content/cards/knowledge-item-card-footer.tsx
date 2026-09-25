// components/knowledge/content/cards/knowledge-item-card-footer.tsx

import type { ReactNode } from "react";

type KnowledgeItemCardFooterProps = {
  left?: ReactNode;
  right?: ReactNode;
};

export function KnowledgeItemCardFooter({
  left,
  right,
}: KnowledgeItemCardFooterProps) {
  if (!left && !right) {
    return null;
  }

  return (
    <footer className="mt-2 flex min-w-0 items-center justify-between gap-3 text-[11px] text-slate-500">
      <div className="min-w-0 flex-1 truncate">
        {left}
      </div>

      {right ? (
        <div className="shrink-0 whitespace-nowrap">
          {right}
        </div>
      ) : null}
    </footer>
  );
}