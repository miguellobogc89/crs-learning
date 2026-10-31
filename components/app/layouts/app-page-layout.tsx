// components/app/layouts/app-page-layout.tsx

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type AppPageLayoutProps = {
  children: ReactNode;
  header?: ReactNode;
  aside?: ReactNode;
  reserveAside?: boolean;
  className?: string;
  contentClassName?: string;
  headerClassName?: string;
  asideClassName?: string;
  asideContentClassName?: string;
};

export function AppPageLayout({
  children,
  header,
  aside,
  reserveAside = false,
  className,
  contentClassName,
  headerClassName,
  asideClassName,
  asideContentClassName,
}: AppPageLayoutProps) {
  const showAside =
    Boolean(aside) || reserveAside;

  return (
    <div
      className={cn(
        "flex h-full min-h-0 min-w-0 overflow-hidden",
        className,
      )}
    >
      <div
        className="
          flex min-h-0 min-w-0 flex-1 flex-col
          overflow-hidden bg-white
        "
      >
        {header ? (
          <header
            className={cn(
              "shrink-0 px-5 pb-3 pt-4 sm:px-6 lg:px-8",
              headerClassName,
            )}
          >
            {header}
          </header>
        ) : null}

        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <div
            className={cn(
              "min-h-0 min-w-0 flex-1 overflow-y-auto",
              "px-5 pb-8 pt-0 sm:px-6 lg:px-8",
              contentClassName,
            )}
          >
            {children}
          </div>
        </div>
      </div>

      {showAside ? (
        <aside
          className={cn(
            "hidden min-h-0 w-[280px] shrink-0",
            "overflow-hidden border-l border-slate-200/70",
            "bg-white",
            "xl:flex xl:flex-col 2xl:w-[300px]",
            asideClassName,
          )}
        >
          <div
            className={cn(
              "flex min-h-0 w-full flex-1 flex-col gap-4 overflow-y-auto p-4",
              "[scrollbar-gutter:stable]",
              asideContentClassName,
            )}
          >
            {aside}
          </div>
        </aside>
      ) : null}
    </div>
  );
}