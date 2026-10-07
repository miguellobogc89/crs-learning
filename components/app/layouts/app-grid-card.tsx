// components/app/layouts/app-grid-card.tsx

import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils";

type AppGridCardProps = ComponentPropsWithoutRef<"div">;

export function AppGridCard({
  children,
  className,
  ...props
}: AppGridCardProps) {
  return (
    <div
      {...props}
      className={cn(
        "min-w-0 rounded-2xl",
        "border border-transparent bg-transparent shadow-none",
        "transition-colors duration-150",
        "hover:border-slate-200/80",
        "focus-within:border-slate-200/80",
        className,
      )}
    >
      {children}
    </div>
  );
}