
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { AppNavigationPanel } from "@/components/app/app-navigation-panel";

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

type AppWorkspaceLayoutProps = {
  topbar: ReactNode;
  sidebarHeader: ReactNode;
  children: ReactNode;
  isAdmin: boolean;
  notificationCount: number;
};

export function AppWorkspaceLayout({
  topbar,
  sidebarHeader,
  children,
  isAdmin,
  notificationCount,
}: AppWorkspaceLayoutProps) {
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
        <AppNavigationPanel
          isAdmin={isAdmin}
          notificationCount={notificationCount}
          sidebarHeader={sidebarHeader}
          sidebar={sidebar}
          sidebarWidth={sidebarWidth}
        />

        <div
          className="
            relative flex min-h-0 min-w-0 flex-1 flex-col
            bg-transparent
          "
        >
          {topbar}

          <main
            className="
              min-h-0 min-w-0 flex-1
              overflow-hidden border-0 bg-transparent
            "
          >
            {children}
          </main>
        </div>
      </div>
    </WorkspaceLayoutContext.Provider>
  );
}