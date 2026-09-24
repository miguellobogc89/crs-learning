// components/app/section-sidebar.tsx


import type { ReactNode } from "react";

import { AssistantSidebarTrigger } from "./assistant-sidebar-trigger";
import { ResizableSectionShell } from "./resizable-section-shell";

type AppSectionSidebarProps = {
  children: ReactNode;
};

export function AppSectionSidebar({
  children,
}: AppSectionSidebarProps) {
  return (
    <aside
      className="
        flex h-full min-h-0 flex-col
        border-0 bg-transparent shadow-none
      "
    >
      <div className="min-h-0 flex-1 bg-transparent">
        {children}
      </div>

      <div
        className="
          shrink-0 border-t border-slate-200/60
          bg-transparent p-4
        "
      >
        <AssistantSidebarTrigger />
      </div>
    </aside>
  );
}

type AppSectionShellProps = {
  sidebar: ReactNode;
  children: ReactNode;
};

export function AppSectionShell({
  sidebar,
  children,
}: AppSectionShellProps) {
  return (
    <ResizableSectionShell
      sidebar={
        <AppSectionSidebar>
          {sidebar}
        </AppSectionSidebar>
      }
    >
      {children}
    </ResizableSectionShell>
  );
}