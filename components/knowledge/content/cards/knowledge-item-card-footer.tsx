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
    <footer className="knowledge-item-card__footer">
      <div className="knowledge-item-card__footer-left">
        {left}
      </div>

      {right ? (
        <div className="knowledge-item-card__footer-right">
          {right}
        </div>
      ) : null}
    </footer>
  );
}
