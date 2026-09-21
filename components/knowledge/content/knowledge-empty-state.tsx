// components/knowledge/content/knowledge-empty-state.tsx
import { Button } from "@/components/ui/button";

type Props = {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  actionIcon?: React.ReactNode;
  onAction?: () => void;
};

export function KnowledgeEmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionIcon,
  onAction,
}: Props) {
  return (
    <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6">
      <div className="max-w-md text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-soft text-brand">
          {icon}
        </div>

        <h2 className="mt-4 text-base font-semibold">
          {title}
        </h2>

        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {description}
        </p>

        {actionLabel && onAction ? (
          <Button
            onClick={onAction}
            variant="brand"
            className="mt-6"
          >
            {actionIcon}
            {actionLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
