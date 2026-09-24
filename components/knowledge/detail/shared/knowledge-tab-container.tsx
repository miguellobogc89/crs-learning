
// components/knowledge/detail/shared/knowledge-tab-container.tsx

import type { ReactNode } from "react";

type KnowledgeTabContainerProps = {
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function KnowledgeTabContainer({
  actions,
  children,
  className = "",
}: KnowledgeTabContainerProps) {
  return (
    <div
      className={[
        "mx-auto w-full min-w-0 max-w-7xl px-6 py-8",
        "lg:px-9 lg:py-9",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {actions ? (
        <div className="mb-9 flex w-full flex-wrap items-center justify-end gap-2">
          {actions}
        </div>
      ) : null}

      <div className="w-full min-w-0">{children}</div>
    </div>
  );
}