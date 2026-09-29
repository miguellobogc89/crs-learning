// components/knowledge/content/cards/knowledge-item-card-body.tsx

import type { ReactNode } from "react";

type KnowledgeItemCardBodyProps = {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  badges?: ReactNode;
};

export function KnowledgeItemCardBody({
  icon,
  title,
  description,
  badges,
}: KnowledgeItemCardBodyProps) {
  return (
    <div className="knowledge-item-card__body">
      <div className="knowledge-item-card__icon-row">
        {icon}
      </div>

      <div className="knowledge-item-card__content">
        {title}

        {description ? (
          <div className="knowledge-item-card__description">
            {description}
          </div>
        ) : null}
      </div>

      {badges ? (
        <div className="knowledge-item-card__badges">
          {badges}
        </div>
      ) : null}
    </div>
  );
}
