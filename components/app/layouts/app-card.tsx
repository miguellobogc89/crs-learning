// components/app/layouts/app-card.tsx

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type AppCardProps = {
  children: ReactNode;
  className?: string;
};

export function AppCard({
  children,
  className,
}: AppCardProps) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-[28px] bg-white p-6",
        "shadow-[0_8px_32px_rgba(37,99,235,0.045)]",
        className,
      )}
    >
      {children}
    </div>
  );
}