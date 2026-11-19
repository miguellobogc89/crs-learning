"use client";

import { useEffect, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

import { MobileAppHeader } from "@/components/platform/mobile-app-header";

/** Pantalla secundaria: sube desde abajo y baja al cerrarse. */
export function DetailScreen({
  open,
  title,
  onClose,
  right,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  right: ReactNode;
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
    <section
      role="dialog"
      aria-modal="true"
      aria-label={title}
      aria-hidden={!open}
      inert={!open}
      className={`fixed inset-0 z-[45] flex min-h-0 flex-col bg-[#F8FAFC] shadow-2xl transition-transform duration-[350ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${open ? "translate-y-0" : "translate-y-full"}`}
    >
      <MobileAppHeader title={title} primary={false} onBackClick={onClose} right={right} />
      <header className="hidden h-20 shrink-0 grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-3 border-b border-slate-200 bg-white px-6 md:grid lg:px-10">
        <button type="button" onClick={onClose} aria-label="Volver" className="flex size-11 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-50">
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="truncate text-center text-xl font-semibold tracking-tight">{title}</h1>
        {right}
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 md:pt-8 lg:px-10">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </section>
  );
}
