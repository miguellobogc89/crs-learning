// components/app/layouts/app-page-layout.tsx

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type AppPageLayoutProps = {
  children: ReactNode;
  header?: ReactNode;
  aside?: ReactNode;
  className?: string;
  contentClassName?: string;
  headerClassName?: string;
  asideClassName?: string;
};

export function AppPageLayout({
  children,
  header,
  aside,
  className,
  contentClassName,
  headerClassName,
  asideClassName,
}: AppPageLayoutProps) {
  const showAside = Boolean(aside);

  return (
    <div
      className={cn(
        "flex h-full min-h-0 min-w-0 overflow-hidden",
        className,
      )}
    >
      {/* Card principal */}
      <div
        className="
          mx-4 mb-4 mt-0
          flex min-h-0 min-w-0 flex-1 flex-col
          overflow-hidden
          rounded-lg border border-slate-200
          bg-white
          shadow-sm
        "
      >
        {/* Cabecera */}
        {header ? (
          <header
            className={cn(
              "shrink-0 border-b border-slate-200 px-5 py-4 sm:px-6",
              headerClassName,
            )}
          >
            {header}
          </header>
        ) : null}

        {/* Contenido */}
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

      {/* Panel derecho opcional */}
      {showAside ? (
        <aside
          className={cn(
            "mb-4 mr-4 mt-0 hidden min-h-0 w-[280px] shrink-0",
            "overflow-hidden rounded-lg border border-slate-200",
            "bg-white shadow-sm",
            "xl:flex xl:flex-col 2xl:w-[300px]",
            asideClassName,
          )}
        >
          {aside}
        </aside>
      ) : null}
    </div>
  );
}