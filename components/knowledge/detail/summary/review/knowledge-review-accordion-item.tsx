// components/knowledge/detail/summary/review/knowledge-review-accordion-item.tsx

"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

type Props = {
  id: string;
  title: string;
  description: string;
  icon: ReactNode;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
};

export function KnowledgeReviewAccordionItem({
  id,
  title,
  description,
  icon,
  badge,
  defaultOpen = false,
  children,
}: Props) {
  return (
    <details
      id={id}
      open={defaultOpen}
      className="group overflow-hidden rounded-2xl border border-border bg-card"
    >
      <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          {icon}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">
              {title}
            </h2>

            {badge}
          </div>

          <p className="mt-1 text-sm text-muted-foreground">
            {description}
          </p>
        </div>

        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>

      <div className="border-t border-border px-5 py-5">
        {children}
      </div>
    </details>
  );
}