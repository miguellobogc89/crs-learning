// components/app/app-navigation-panel.tsx

"use client";

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

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
  const pathname = usePathname();

  const [isChangingSection, setIsChangingSection] =
    useState(false);

  const [animationKey, setAnimationKey] = useState(0);

  const [visibleSidebar, setVisibleSidebar] =
    useState<ReactNode | null>(sidebar);

  const previousPathRef = useRef(pathname);
  const pendingPathRef = useRef<string | null>(null);

  /*
   * Iniciamos el cambio visual en el clic, sin esperar
   * a que Next.js complete la navegación.
   */
  function handleNavigationClick(
    event: MouseEvent<HTMLDivElement>,
  ) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    const target = event.target;

    if (!(target instanceof Element)) {
      return;
    }

    const link = target.closest<HTMLAnchorElement>("a[href]");

    if (!link) {
      return;
    }

    if (
      link.hasAttribute("download") ||
      (link.target && link.target !== "_self")
    ) {
      return;
    }

    const destination = new URL(
      link.href,
      window.location.href,
    );

    if (destination.origin !== window.location.origin) {
      return;
    }

    if (
      destination.pathname === pathname &&
      destination.search === window.location.search
    ) {
      return;
    }

    pendingPathRef.current = destination.pathname;

    setIsChangingSection(true);
  }

  /*
   * También cubre cambios de ruta iniciados desde
   * otros puntos de la aplicación.
   */
  useEffect(() => {
    if (previousPathRef.current === pathname) {
      return;
    }

    previousPathRef.current = pathname;
    pendingPathRef.current = pathname;

    setIsChangingSection(true);
  }, [pathname]);

  /*
   * Al registrarse la nueva sidebar, mostramos su contenido
   * y reiniciamos únicamente la animación de entrada.
   */
  useEffect(() => {
    if (!sidebar) {
      if (!pendingPathRef.current) {
        setVisibleSidebar(null);
      }

      return;
    }

    setVisibleSidebar(sidebar);

    if (pendingPathRef.current) {
      pendingPathRef.current = null;
      setAnimationKey((current) => current + 1);
      setIsChangingSection(false);
    }
  }, [sidebar]);

  return (
    <div
      className={`
        relative hidden min-h-0 shrink-0
        overflow-hidden rounded-[20px]
        border border-slate-200/70
        bg-[#FCFDFF]
        shadow-[0_8px_32px_rgba(15,23,42,0.07)]
        lg:my-3 lg:ml-3 lg:flex
      `}
    >
      {/* Barra principal */}
      <div
        className="h-full w-14 shrink-0 bg-transparent"
        onClickCapture={handleNavigationClick}
      >
        <AppSidebar
          isAdmin={isAdmin}
          notificationCount={notificationCount}
        />
      </div>

      {/* Barra secundaria */}
      <div
        className={`
          flex h-full min-h-0 shrink-0 flex-col
          border-l border-slate-200/60
          bg-transparent
        `}
        style={{ width: sidebarWidth }}
      >
        {/* Selector de workspace: permanece fijo */}
        <div
          className={`
            flex h-[88px] shrink-0 items-center
            border-b border-slate-200/60
            bg-transparent px-4
          `}
        >
          <div className="w-full min-w-0">
            {sidebarHeader}
          </div>
        </div>

        {/* Contenido contextual con transición */}
        <div
          className={`
            relative min-h-0 flex-1
            overflow-hidden bg-transparent
          `}
        >
          {!isChangingSection && visibleSidebar ? (
            <div
              key={animationKey}
              className={`
                h-full min-h-0
                animate-[sidebarFadeIn_180ms_ease-out_both]
                motion-reduce:animate-none
              `}
            >
              {visibleSidebar}
            </div>
          ) : null}
        </div>
      </div>

      <style jsx>{`
        @keyframes sidebarFadeIn {
          from {
            opacity: 0;
            transform: translateY(3px);
          }

          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}