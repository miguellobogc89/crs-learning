
// components/app/app-workspace-layout.tsx

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

import { AppNavigationPanel } from "@/components/app/app-navigation-panel";

type WorkspaceLayoutContextValue = {
  sidebar: ReactNode | null;
  setSidebar: Dispatch<SetStateAction<ReactNode | null>>;
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
};

const WorkspaceLayoutContext =
  createContext<WorkspaceLayoutContextValue | null>(null);

const SECTION_SIDEBAR_WIDTH = {
  compact: 220,
  laptop: 240,
  default: 280,
  max: 420,
} as const;

const BREAKPOINT = {
  lg: 1024,
  xl: 1280,
  "2xl": 1400,
} as const;

const STORAGE_KEY = "crs-lab:section-sidebar-width";

type SidebarWidthBounds = {
  min: number;
  default: number;
  max: number;
};

function getSidebarWidthBounds(viewportWidth: number): SidebarWidthBounds {
  if (viewportWidth >= BREAKPOINT["2xl"]) {
    return {
      min: SECTION_SIDEBAR_WIDTH.compact,
      default: SECTION_SIDEBAR_WIDTH.default,
      max: SECTION_SIDEBAR_WIDTH.max,
    };
  }

  if (viewportWidth >= BREAKPOINT.xl) {
    return {
      min: SECTION_SIDEBAR_WIDTH.compact,
      default: SECTION_SIDEBAR_WIDTH.laptop,
      max: SECTION_SIDEBAR_WIDTH.laptop,
    };
  }

  if (viewportWidth >= BREAKPOINT.lg) {
    return {
      min: SECTION_SIDEBAR_WIDTH.compact,
      default: SECTION_SIDEBAR_WIDTH.compact,
      max: SECTION_SIDEBAR_WIDTH.compact,
    };
  }

  return {
    min: SECTION_SIDEBAR_WIDTH.compact,
    default: SECTION_SIDEBAR_WIDTH.compact,
    max: SECTION_SIDEBAR_WIDTH.max,
  };
}

function clampSidebarWidth(
  width: number,
  bounds: SidebarWidthBounds,
) {
  return Math.min(bounds.max, Math.max(bounds.min, width));
}

function getInitialSidebarWidth() {
  return SECTION_SIDEBAR_WIDTH.default;
}

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

  const [preferredSidebarWidth, setPreferredSidebarWidth] =
    useState<number>(getInitialSidebarWidth);

  const [sidebarWidthBounds, setSidebarWidthBounds] =
    useState<SidebarWidthBounds>(() =>
      getSidebarWidthBounds(BREAKPOINT["2xl"]),
    );

  const sidebarWidth = clampSidebarWidth(
    preferredSidebarWidth,
    sidebarWidthBounds,
  );

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);

    if (!stored) {
      return;
    }

    const parsed = Number(stored);

    if (Number.isFinite(parsed)) {
      setPreferredSidebarWidth(parsed);
    }
  }, []);

  useEffect(() => {
    function syncSidebarBounds() {
      setSidebarWidthBounds(
        getSidebarWidthBounds(window.innerWidth),
      );
    }

    syncSidebarBounds();

    window.addEventListener("resize", syncSidebarBounds);

    return () => {
      window.removeEventListener("resize", syncSidebarBounds);
    };
  }, []);

  const setSidebarWidth = useCallback((width: number) => {
    const nextWidth = clampSidebarWidth(
      width,
      getSidebarWidthBounds(window.innerWidth),
    );

    setPreferredSidebarWidth(nextWidth);

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
