// components/knowledge/sidebar/knowledge-sidebar.tsx

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
    <aside className="flex h-full min-h-0 flex-col border-r border-border bg-panel">
      <div className="min-h-0 flex-1">
        {children}
      </div>

      <div className="shrink-0 border-t border-border bg-panel p-4">
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
