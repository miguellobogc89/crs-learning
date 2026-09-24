// components/app/app-workspace-layout.tsx



"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type WorkspaceLayoutContextValue = {
  sidebar: ReactNode | null;
  setSidebar: (sidebar: ReactNode | null) => void;
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
};

const WorkspaceLayoutContext =
  createContext<WorkspaceLayoutContextValue | null>(null);

const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 220;
const MAX_WIDTH = 420;
const STORAGE_KEY = "crs-lab:section-sidebar-width";

export function useWorkspaceLayout() {
  const context = useContext(WorkspaceLayoutContext);

  if (!context) {
    throw new Error(
      "useWorkspaceLayout must be used inside AppWorkspaceLayout",
    );
  }

  return context;
}

export function AppWorkspaceLayout({
  topbar,
  sidebarHeader,
  children,
}: {
  topbar: ReactNode;
  sidebarHeader: ReactNode;
  children: ReactNode;
}) {
  const [sidebar, setSidebar] = useState<ReactNode | null>(null);

  const [sidebarWidth, setSidebarWidthState] =
    useState(DEFAULT_WIDTH);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);

    if (!stored) {
      return;
    }

    const parsed = Number(stored);

    if (Number.isFinite(parsed)) {
      setSidebarWidthState(
        Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, parsed)),
      );
    }
  }, []);

  const setSidebarWidth = useCallback((width: number) => {
    const nextWidth = Math.min(
      MAX_WIDTH,
      Math.max(MIN_WIDTH, width),
    );

    setSidebarWidthState(nextWidth);

    window.localStorage.setItem(
      STORAGE_KEY,
      String(nextWidth),
    );
  }, []);

  return (
    <WorkspaceLayoutContext.Provider
      value={{
        sidebar,
        setSidebar,
        sidebarWidth,
        setSidebarWidth,
      }}
    >
      <div className="flex min-h-0 min-w-0 flex-1">
        {sidebar ? (
          <div
            className="hidden h-full min-h-0 shrink-0 flex-col border-r border-border bg-panel lg:flex"
            style={{ width: sidebarWidth }}
          >
            <div className="flex h-16 shrink-0 items-center border-b border-border bg-panel px-4">
              <div className="min-w-0 w-full">
                {sidebarHeader}
              </div>
            </div>

            <div className="min-h-0 flex-1">
              {sidebar}
            </div>
          </div>
        ) : null}


<div
  className="
    relative flex min-h-0 min-w-0 flex-1 flex-col
    bg-[#f8faff]
    [background-image:radial-gradient(ellipse_65%_55%_at_18%_8%,rgba(59,130,246,0.12),transparent_75%),radial-gradient(ellipse_55%_65%_at_88%_18%,rgba(37,99,235,0.09),transparent_75%),radial-gradient(ellipse_70%_60%_at_55%_95%,rgba(96,165,250,0.07),transparent_80%)]
  "
>
  {topbar}


<main className="min-h-0 min-w-0 flex-1 overflow-hidden border-0 bg-transparent">
  {children}
</main>
</div>
      </div>
    </WorkspaceLayoutContext.Provider>
  );
}