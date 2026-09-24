"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 220;
const MAX_WIDTH = 420;
const STORAGE_KEY = "crs-lab:section-sidebar-width";

function clampSidebarWidth(width: number) {
  return Math.min(
    MAX_WIDTH,
    Math.max(MIN_WIDTH, width),
  );
}

type ResizableSectionShellProps = {
  sidebar: ReactNode;
  children: ReactNode;
};

export function ResizableSectionShell({
  sidebar,
  children,
}: ResizableSectionShellProps) {
  const [sidebarWidth, setSidebarWidth] =
    useState(DEFAULT_WIDTH);
  const [isDragging, setIsDragging] = useState(false);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const previousBodyStyles = useRef<{
    cursor: string;
    userSelect: string;
  } | null>(null);

  useEffect(() => {
    let animationFrame = 0;
    const storedWidth = window.localStorage.getItem(STORAGE_KEY);

    if (!storedWidth) {
      return undefined;
    }

    const parsedWidth = Number(storedWidth);

    if (!Number.isFinite(parsedWidth)) {
      return undefined;
    }

    animationFrame = window.requestAnimationFrame(() => {
      setSidebarWidth(clampSidebarWidth(parsedWidth));
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  useEffect(() => {
    if (!isDragging) {
      return;
    }

    previousBodyStyles.current = {
      cursor: document.body.style.cursor,
      userSelect: document.body.style.userSelect,
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function handlePointerMove(event: PointerEvent) {
      const shell = shellRef.current;

      if (!shell) {
        return;
      }

      const shellLeft = shell.getBoundingClientRect().left;
      const nextWidth = clampSidebarWidth(
        event.clientX - shellLeft,
      );

      setSidebarWidth(nextWidth);
      window.localStorage.setItem(
        STORAGE_KEY,
        String(nextWidth),
      );
    }

    function handlePointerUp() {
      setIsDragging(false);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);

      if (previousBodyStyles.current) {
        document.body.style.cursor =
          previousBodyStyles.current.cursor;
        document.body.style.userSelect =
          previousBodyStyles.current.userSelect;
        previousBodyStyles.current = null;
      }
    };
  }, [isDragging]);

  function resetSidebarWidth() {
    setSidebarWidth(DEFAULT_WIDTH);
    window.localStorage.setItem(
      STORAGE_KEY,
      String(DEFAULT_WIDTH),
    );
  }

  return (
    <div
      ref={shellRef}
      className="grid h-full min-h-0 bg-background"
      style={{
        gridTemplateColumns: `${sidebarWidth}px minmax(0, 1fr)`,
      }}
    >
      <div className="relative h-full min-h-0 min-w-0">
        {sidebar}

        <button
          type="button"
          aria-label="Redimensionar sidebar secundaria"
          title="Arrastra para redimensionar. Doble clic para restaurar."
          className="group absolute inset-y-0 right-0 z-20 flex w-3 translate-x-1/2 cursor-col-resize items-stretch justify-center outline-none"
          onPointerDown={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDoubleClick={resetSidebarWidth}
        >
          <span
            className={cn(
              "my-2 w-px rounded-full bg-transparent transition-colors",
              "group-hover:bg-border group-focus-visible:bg-brand",
              isDragging && "bg-brand",
            )}
          />
        </button>
      </div>

      <section className="h-full min-w-0 overflow-hidden">
        {children}
      </section>
    </div>
  );
}
