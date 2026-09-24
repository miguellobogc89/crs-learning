// components/app/app-navigation-panel.tsx

import type { ReactNode } from "react";

import { AppSidebar } from "@/components/app/sidebar";

type AppNavigationPanelProps = {
  isAdmin: boolean;
  notificationCount: number;
  sidebarHeader: ReactNode;
  sidebar: ReactNode | null;
  sidebarWidth: number;
};

export function AppNavigationPanel({
  isAdmin,
  notificationCount,
  sidebarHeader,
  sidebar,
  sidebarWidth,
}: AppNavigationPanelProps) {
  return (
    <div
      className="
        hidden h-full min-h-0 shrink-0
        overflow-hidden border-r border-border
        bg-panel lg:flex
      "
    >
      {/* Navegación principal: barra fina */}
      <div className="h-full w-14 shrink-0">
        <AppSidebar
          isAdmin={isAdmin}
          notificationCount={notificationCount}
        />
      </div>

      {/* Navegación contextual: cambia según la sección */}
      {sidebar ? (
        <div
          className="
            flex h-full min-h-0 shrink-0 flex-col
            border-l border-border/60
          "
          style={{ width: sidebarWidth }}
        >
          <div
            className="
              flex h-16 shrink-0 items-center
              border-b border-border/60 px-4
            "
          >
            <div className="w-full min-w-0">
              {sidebarHeader}
            </div>
          </div>

          <div className="min-h-0 flex-1">
            {sidebar}
          </div>
        </div>
      ) : null}
    </div>
  );
}