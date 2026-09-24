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
        relative hidden min-h-0 shrink-0
        overflow-hidden rounded-[20px]
        border border-slate-200/70
        bg-[#FCFDFF]
        shadow-[0_8px_32px_rgba(15,23,42,0.07)]
        lg:my-3 lg:ml-3 lg:flex
      "
    >
      {/* Barra principal: 56 px */}
      <div className="h-full w-14 shrink-0 bg-transparent">
        <AppSidebar
          isAdmin={isAdmin}
          notificationCount={notificationCount}
        />
      </div>

      {/* Sidebar contextual de la sección activa */}
      {sidebar ? (
        <div
          className="
            flex h-full min-h-0 shrink-0 flex-col
            border-l border-slate-200/60
            bg-transparent
          "
          style={{ width: sidebarWidth }}
        >
          {/* Cabecera: selector de workspace */}
<div
  className="
    flex h-[88px] shrink-0 items-center
    border-b border-slate-200/60
    bg-transparent px-4
  "
>
  <div className="w-full min-w-0">
    {sidebarHeader}
  </div>
</div>

          {/* Contenido contextual */}
          <div className="min-h-0 flex-1 bg-transparent">
            {sidebar}
          </div>
        </div>
      ) : null}
    </div>
  );
}