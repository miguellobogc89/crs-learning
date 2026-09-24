
// components/app/resizable-section-shell.tsx

"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useWorkspaceLayout } from "@/components/app/app-workspace-layout";
import { cn } from "@/lib/utils";

const DEFAULT_WIDTH = 280;

type ResizableSectionShellProps = {
  sidebar: ReactNode;
  children: ReactNode;
};

export function ResizableSectionShell({
  sidebar,
  children,
}: ResizableSectionShellProps) {
  const { setSidebar, setSidebarWidth } = useWorkspaceLayout();

  const [isDragging, setIsDragging] = useState(false);

  const sidebarRef = useRef<HTMLDivElement | null>(null);
  const setSidebarWidthRef = useRef(setSidebarWidth);

  useEffect(() => {
    setSidebarWidthRef.current = setSidebarWidth;
  }, [setSidebarWidth]);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      setIsDragging(true);
    },
    [],
  );

  const handleDoubleClick = useCallback(() => {
    setSidebarWidthRef.current(DEFAULT_WIDTH);
  }, []);

  /*
   * Cada registro tiene una identidad propia.
   * La limpieza de una sección anterior solo puede
   * eliminar su propio registro, nunca el de la nueva.
   */
  useEffect(() => {
    const registeredSidebar = (
      <div
        ref={sidebarRef}
        className="relative h-full min-h-0 min-w-0"
      >
        {sidebar}

        <button
          type="button"
          aria-label="Redimensionar sidebar secundaria"
          title="Arrastra para redimensionar. Doble clic para restaurar."
          className="
            group absolute inset-y-0 right-0 z-20
            flex w-3 translate-x-1/2 cursor-col-resize
            items-stretch justify-center outline-none
          "
          onPointerDown={handlePointerDown}
          onDoubleClick={handleDoubleClick}
        >
          <span
            className={cn(
              "my-2 w-px rounded-full bg-transparent transition-colors",
              "group-hover:bg-border group-focus-visible:bg-brand",
            )}
          />
        </button>
      </div>
    );

    setSidebar(registeredSidebar);

    return () => {
      /*
       * El layout comprobará que este registro sigue
       * siendo el activo antes de retirarlo.
       */
      setSidebar((current) =>
        current === registeredSidebar ? null : current,
      );
    };
  }, [
    sidebar,
    setSidebar,
    handlePointerDown,
    handleDoubleClick,
  ]);

  /*
   * El arrastre modifica únicamente el ancho compartido
   * con el layout principal.
   */
  useEffect(() => {
    if (!isDragging) {
      return;
    }

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function handlePointerMove(event: PointerEvent) {
      const sidebarElement = sidebarRef.current;

      if (!sidebarElement) {
        return;
      }

      const left =
        sidebarElement.getBoundingClientRect().left;

      setSidebarWidthRef.current(event.clientX - left);
    }

    function handlePointerUp() {
      setIsDragging(false);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener(
        "pointermove",
        handlePointerMove,
      );

      window.removeEventListener(
        "pointerup",
        handlePointerUp,
      );

      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [isDragging]);

  return (
    <section className="h-full min-h-0 min-w-0 overflow-hidden">
      {children}
    </section>
  );
}