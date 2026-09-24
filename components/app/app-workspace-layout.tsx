// components/app/app-workspace-layout.tsx


import type { ReactNode } from "react";

type AppWorkspaceLayoutProps = {
  primarySidebar: ReactNode;
  secondarySidebar?: ReactNode;
  topbar: ReactNode;
  children: ReactNode;
};

export function AppWorkspaceLayout({
  primarySidebar,
  secondarySidebar,
  topbar,
  children,
}: AppWorkspaceLayoutProps) {
  return (
    <div className="flex h-dvh w-full min-w-0 overflow-hidden bg-transparent text-foreground">
      {/* Menú principal: altura completa */}
      <div className="h-full shrink-0">
        {primarySidebar}
      </div>

      {/* Explorador: altura completa, junto al menú principal */}
      {secondarySidebar && (
        <div className="h-full min-h-0 min-w-0 shrink-0 overflow-hidden">
          {secondarySidebar}
        </div>
      )}

      {/* Zona derecha: topbar + contenido */}
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="min-w-0 shrink-0">
          {topbar}
        </div>

        <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}