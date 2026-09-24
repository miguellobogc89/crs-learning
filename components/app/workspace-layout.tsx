// components/app/workspace-layout.tsx


"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

const DEFAULT_SIDEBAR_WIDTH = 280;
const MIN_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 420;

const STORAGE_KEY = "crs-lab:section-sidebar-width";

type WorkspaceLayoutContextValue = {
  secondarySidebarTarget: HTMLDivElement | null;
};

const WorkspaceLayoutContext =
  createContext<WorkspaceLayoutContextValue>({
    secondarySidebarTarget: null,
  });

type WorkspaceLayoutProps = {
  primarySidebar: ReactNode;
  topbar: ReactNode;
  children: ReactNode;
};

function clampSidebarWidth(width: number) {
  return Math.min(
    MAX_SIDEBAR_WIDTH,
    Math.max(MIN_SIDEBAR_WIDTH, width),
  );
}

export function WorkspaceLayout({
  primarySidebar,
  topbar,
  children,
}: WorkspaceLayoutProps) {
  const [secondarySidebarTarget, setSecondarySidebarTarget] =
    useState<HTMLDivElement | null>(null);

  const [hasSecondarySidebar, setHasSecondarySidebar] =
    useState(false);

  const [sidebarWidth, setSidebarWidth] = useState(
    DEFAULT_SIDEBAR_WIDTH,
  );

  const sidebarColumnRef = useRef<HTMLDivElement | null>(
    null,
  );

  const draggingRef = useRef(false);

  const previousBodyStylesRef = useRef<{
    cursor: string;
    userSelect: string;
  } | null>(null);

  /*
   * Restaurar la anchura guardada.
   */
  useEffect(() => {
    const storedWidth = window.localStorage.getItem(
      STORAGE_KEY,
    );

    if (!storedWidth) {
      return;
    }

    const parsedWidth = Number(storedWidth);

    if (!Number.isFinite(parsedWidth)) {
      return;
    }

    setSidebarWidth(
      clampSidebarWidth(parsedWidth),
    );
  }, []);

  /*
   * Detectar cuándo el explorador se monta o desmonta.
   *
   * El contenedor del portal permanece siempre montado.
   * Esto permite navegar entre secciones sin perder
   * la referencia del explorador.
   */
  useEffect(() => {
    if (!secondarySidebarTarget) {
      setHasSecondarySidebar(false);
      return;
    }

    const updateSidebarPresence = () => {
      setHasSecondarySidebar(
        secondarySidebarTarget.childElementCount > 0,
      );
    };

    updateSidebarPresence();

    const observer = new MutationObserver(
      updateSidebarPresence,
    );

    observer.observe(secondarySidebarTarget, {
      childList: true,
    });

    return () => {
      observer.disconnect();
    };
  }, [secondarySidebarTarget]);

  /*
   * Redimensionamiento del explorador.
   */
  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      if (!draggingRef.current) {
        return;
      }

      const sidebarColumn = sidebarColumnRef.current;

      if (!sidebarColumn) {
        return;
      }

      const { left } =
        sidebarColumn.getBoundingClientRect();

      const nextWidth = clampSidebarWidth(
        event.clientX - left,
      );

      setSidebarWidth(nextWidth);

      window.localStorage.setItem(
        STORAGE_KEY,
        String(nextWidth),
      );
    }

    function handlePointerUp() {
      if (!draggingRef.current) {
        return;
      }

      draggingRef.current = false;

      if (previousBodyStylesRef.current) {
        document.body.style.cursor =
          previousBodyStylesRef.current.cursor;

        document.body.style.userSelect =
          previousBodyStylesRef.current.userSelect;

        previousBodyStylesRef.current = null;
      }
    }

    window.addEventListener(
      "pointermove",
      handlePointerMove,
    );

    window.addEventListener(
      "pointerup",
      handlePointerUp,
    );

    return () => {
      window.removeEventListener(
        "pointermove",
        handlePointerMove,
      );

      window.removeEventListener(
        "pointerup",
        handlePointerUp,
      );

      if (previousBodyStylesRef.current) {
        document.body.style.cursor =
          previousBodyStylesRef.current.cursor;

        document.body.style.userSelect =
          previousBodyStylesRef.current.userSelect;

        previousBodyStylesRef.current = null;
      }

      draggingRef.current = false;
    };
  }, []);

  function handleResizeStart(
    event: React.PointerEvent<HTMLButtonElement>,
  ) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();

    previousBodyStylesRef.current = {
      cursor: document.body.style.cursor,
      userSelect: document.body.style.userSelect,
    };

    draggingRef.current = true;

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  function handleResizeReset() {
    setSidebarWidth(DEFAULT_SIDEBAR_WIDTH);

    window.localStorage.setItem(
      STORAGE_KEY,
      String(DEFAULT_SIDEBAR_WIDTH),
    );
  }

  return (
    <WorkspaceLayoutContext.Provider
      value={{ secondarySidebarTarget }}
    >
      <div className="flex h-dvh min-h-0 w-full min-w-0 overflow-hidden bg-background text-foreground">
        {/* 1. MENÚ PRINCIPAL: ALTURA COMPLETA */}
        <div className="h-full min-h-0 shrink-0">
          {primarySidebar}
        </div>

        {/* 2. EXPLORADOR: ALTURA COMPLETA */}
        <div
          ref={sidebarColumnRef}
          className={
            hasSecondarySidebar
              ? "relative h-full min-h-0 shrink-0 border-r border-border bg-panel"
              : "hidden"
          }
          style={{
            width: hasSecondarySidebar
              ? sidebarWidth
              : undefined,
          }}
        >
          <div
            ref={setSecondarySidebarTarget}
            className="h-full min-h-0 w-full overflow-hidden"
          />

          {hasSecondarySidebar && (
            <button
              type="button"
              aria-label="Redimensionar explorador"
              title="Arrastra para cambiar la anchura. Doble clic para restaurar."
              className="group absolute inset-y-0 right-0 z-20 flex w-3 translate-x-1/2 cursor-col-resize items-stretch justify-center bg-transparent outline-none"
              onPointerDown={handleResizeStart}
              onDoubleClick={handleResizeReset}
            >
              <span className="my-2 w-px rounded-full bg-transparent transition-colors group-hover:bg-border group-focus-visible:bg-border" />
            </button>
          )}
        </div>

        {/* 3. ZONA DERECHA: TOPBAR + CONTENIDO */}
        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {/* TOPBAR: SOLO A LA DERECHA DE LOS DOS MENÚS */}
          <div className="min-w-0 shrink-0">
            {topbar}
          </div>

          {/* CONTENIDO: DEBAJO DE LA TOPBAR */}
          <main className="min-h-0 min-w-0 flex-1 overflow-hidden bg-background">
            {children}
          </main>
        </div>
      </div>
    </WorkspaceLayoutContext.Provider>
  );
}

/*
 * Este componente permite que AppSectionShell
 * coloque el explorador en la columna izquierda
 * del WorkspaceLayout.
 */
export function WorkspaceSecondarySidebar({
  children,
}: {
  children: ReactNode;
}) {
  const { secondarySidebarTarget } = useContext(
    WorkspaceLayoutContext,
  );

  if (!secondarySidebarTarget) {
    return null;
  }

  return createPortal(
    children,
    secondarySidebarTarget,
  );
}