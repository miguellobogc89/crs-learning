// components/knowledge/content/cards/shared/expandable-card-footer.tsx
"use client";

import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
};

export function ExpandableCardFooter({
  children,
  className = "",
}: Props) {
  return (
    <div
      className={[
        "h-[96px] shrink-0",
        "overflow-hidden border-t border-border bg-card",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}