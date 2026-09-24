// components/app/layouts/app-page-layout.tsx

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type AppPageLayoutProps = {
  children: ReactNode;
  aside?: ReactNode;
  className?: string;
  contentClassName?: string;
  asideClassName?: string;
};

export function AppPageLayout({
  children,
  aside,
  className,
  contentClassName,
  asideClassName,
}: AppPageLayoutProps) {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 min-w-0 overflow-hidden",
        className,
      )}
    >
      {/* Contenido principal: es la única columna que hace scroll */}
      <div
        className={cn(
          "h-full min-h-0 min-w-0 flex-1 overflow-y-auto",
          "px-5 pb-8 pt-4 sm:px-6 lg:px-8",
          contentClassName,
        )}
      >
        {children}
      </div>

      {/* Columna derecha: permanece visible al desplazarse por la página */}
      {aside ? (
        <aside
          className={cn(
            "hidden h-full min-h-0 w-[280px] shrink-0 flex-col",
            "overflow-y-auto border-l border-slate-200/50",
            "bg-transparent px-4 pb-6 pt-4",
            "xl:flex 2xl:w-[300px]",
            asideClassName,
          )}
        >
          <div className="flex min-h-full flex-col gap-5">
            {aside}
          </div>
        </aside>
      ) : null}
    </div>
  );
}