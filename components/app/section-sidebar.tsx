// components/app/section-sidebar.tsx


import type { ReactNode } from "react";

import type { AccessibleWorkspace } from "@/lib/repositories/workspace.repository";

import { AssistantSidebarTrigger } from "./assistant-sidebar-trigger";
import { SectionSidebarHeader } from "./section-sidebar-header";
import { WorkspaceSecondarySidebar } from "./workspace-layout";

type AppSectionSidebarProps = {
  children: ReactNode;
  activeWorkspace: AccessibleWorkspace;
  workspaces: AccessibleWorkspace[];
};

export function AppSectionSidebar({
  children,
  activeWorkspace,
  workspaces,
}: AppSectionSidebarProps) {
  return (
    <aside className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-panel">
      <SectionSidebarHeader
        activeWorkspace={activeWorkspace}
        workspaces={workspaces}
      />

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
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
  activeWorkspace: AccessibleWorkspace;
  workspaces: AccessibleWorkspace[];
};

export function AppSectionShell({
  sidebar,
  children,
  activeWorkspace,
  workspaces,
}: AppSectionShellProps) {
  return (
    <>
      <WorkspaceSecondarySidebar>
        <AppSectionSidebar
          activeWorkspace={activeWorkspace}
          workspaces={workspaces}
        >
          {sidebar}
        </AppSectionSidebar>
      </WorkspaceSecondarySidebar>

      <div className="h-full min-h-0 min-w-0 overflow-hidden">
        {children}
      </div>
    </>
  );
}