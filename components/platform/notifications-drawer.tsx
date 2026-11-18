"use client";

import { useEffect, type ReactNode } from "react";
import { Bell, X } from "lucide-react";

import { MobileAppHeader } from "@/components/platform/mobile-app-header";

/** Presentación compartida de los avisos; cada módulo aporta su propio contenido. */
export function NotificationsDrawer({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`fixed inset-0 z-40 hidden bg-slate-900/20 transition-opacity duration-300 md:block ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Notificaciones"
        aria-hidden={!open}
        className={`fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-white shadow-2xl transition-transform duration-300 ease-out md:max-w-md md:pt-[env(safe-area-inset-top)] ${open ? "translate-x-0" : "pointer-events-none translate-x-full"}`}
      >
        <MobileAppHeader
          primary={false}
          onBackClick={onClose}
          title="Notificaciones"
          right={<Bell className="size-5 text-slate-500" aria-hidden="true" />}
        />
        <header className="hidden h-14 shrink-0 items-center justify-between border-b border-slate-200/70 px-4 md:flex">
          <h2 className="text-[17px] font-semibold text-slate-900">Notificaciones</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100">
            <X className="size-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
          {children}
        </div>
      </aside>
    </>
  );
}
