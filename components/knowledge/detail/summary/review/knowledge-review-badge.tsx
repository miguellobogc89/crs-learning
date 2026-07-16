// components/knowledge/detail/summary/review/knowledge-review-badge.tsx

import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  variant?:
    | "default"
    | "success"
    | "warning"
    | "danger"
    | "info";
};

const variants: Record<
  NonNullable<Props["variant"]>,
  string
> = {
  default:
    "border-border bg-muted text-muted-foreground",

  success:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300",

  warning:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300",

  danger:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300",

  info:
    "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-300",
};

export function KnowledgeReviewBadge({
  children,
  variant = "default",
}: Props) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
        variants[variant],
      ].join(" ")}
    >
      {children}
    </span>
  );
}