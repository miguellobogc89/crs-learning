// components/knowledge/detail/shared/knowledge-empty-state.tsx

import { Button } from "@/components/ui/button";

type KnowledgeEmptyStateProps = {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  actionIcon?: React.ReactNode;
  onAction: () => void;
  disabled?: boolean;
};

export function KnowledgeEmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionIcon,
  onAction,
  disabled = false,
}: KnowledgeEmptyStateProps) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600 dark:bg-cyan-950/30 dark:text-cyan-300">
        {icon}
      </div>

      <h2 className="mt-4 text-base font-semibold text-foreground">
        {title}
      </h2>

      <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
        {description}
      </p>

      <Button
        type="button"
        disabled={disabled}
        onClick={onAction}
        className="mt-6 h-10 bg-black px-5 text-white hover:bg-black/85"
      >
        {actionIcon}
        {actionLabel}
      </Button>
    </div>
  );
}