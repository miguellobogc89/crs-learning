"use client";

import Link from "next/link";
import { ArrowLeft, Menu } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Cabecera móvil compartida por los módulos.
 * Principal: menú · título centrado · notificaciones.
 * Secundaria: volver · título centrado · notificaciones.
 */
export function MobileAppHeader({
  title,
  primary,
  onMenuClick,
  menuControl,
  backHref,
  onBackClick,
  right,
}: {
  title: ReactNode;
  primary: boolean;
  onMenuClick?: () => void;
  menuControl?: ReactNode;
  backHref?: string;
  onBackClick?: () => void;
  right: ReactNode;
}) {
  const controlClass = "flex size-11 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100 active:bg-slate-100";

  let left: ReactNode;
  if (primary) {
    left = menuControl ?? (
      <button type="button" className={controlClass} onClick={onMenuClick} aria-label="Abrir el menú">
        <Menu className="size-5" />
      </button>
    );
  } else if (onBackClick) {
    left = (
      <button type="button" className={controlClass} onClick={onBackClick} aria-label="Volver">
        <ArrowLeft className="size-5" />
      </button>
    );
  } else {
    left = (
      <Link href={backHref ?? "/apps"} className={controlClass} aria-label="Volver">
        <ArrowLeft className="size-5" />
      </Link>
    );
  }

  return (
    <header className="sticky top-0 z-30 grid h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-end gap-2 border-b border-slate-200/70 bg-white/95 px-2 pb-0 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden">
      <div className="flex h-14 items-center justify-center">{left}</div>
      <h1 className="flex h-14 min-w-0 items-center justify-center gap-2 overflow-hidden text-center text-[17px] font-semibold text-slate-900">
        {title}
      </h1>
      <div className="flex h-14 items-center justify-center">{right}</div>
    </header>
  );
}
