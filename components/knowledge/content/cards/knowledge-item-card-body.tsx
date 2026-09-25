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
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="mb-2 flex shrink-0 items-center">
        {icon}
      </div>

      <div className="min-w-0">
        {title}

        {description ? (
          <div className="mt-0.5 min-w-0">
            {description}
          </div>
        ) : null}
      </div>

      {badges ? (
        <div className="mt-1.5 flex min-w-0 items-center">
          {badges}
        </div>
      ) : null}
    </div>
  );
}