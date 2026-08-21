// components/knowledge/sidebar/knowledge-sidebar.tsx

import type { ReactNode } from "react";

import { AssistantSidebarTrigger } from "./assistant-sidebar-trigger";

type AppSectionSidebarProps = {
  children: ReactNode;
};

export function AppSectionSidebar({
  children,
}: AppSectionSidebarProps) {
  return (
    <aside className="flex min-h-0 flex-col border-r border-border bg-panel">
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
    <div className="grid h-full grid-cols-[280px_minmax(0,1fr)] bg-background">
      <AppSectionSidebar>
        {sidebar}
      </AppSectionSidebar>

      <section className="min-w-0 overflow-hidden">
        {children}
      </section>
    </div>
  );
}
