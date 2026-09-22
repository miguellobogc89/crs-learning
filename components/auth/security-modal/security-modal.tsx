// components/auth/security-modal/security-modal.tsx
"use client";

import { useEffect, useId, useRef } from "react";
import { ShieldCheck, X } from "lucide-react";
import { InfrastructureSection } from "./infrastructure-section";

type SecurityModalProps = { open: boolean; onClose: () => void };

export function SecurityModal({ open, onClose }: SecurityModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusables = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-[6px] sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[min(90dvh,850px)] w-full max-w-[680px] flex-col overflow-hidden rounded-[24px] border border-white/70 bg-white shadow-2xl shadow-slate-950/25 sm:rounded-[28px]"
      >
        <header className="relative shrink-0 overflow-hidden border-b border-sky-100 bg-gradient-to-br from-white via-white to-sky-50 px-5 py-5 sm:px-8 sm:py-7">
          <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-32 h-80 w-80 rounded-full bg-sky-100/70 blur-3xl" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-sky-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-700 sm:text-[11px]">
              <ShieldCheck className="h-3.5 w-3.5" /> CRS LAB · Seguridad
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="Cerrar información de seguridad"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="relative mt-5 flex items-center gap-4 sm:mt-6 sm:gap-5">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-sky-100 bg-sky-50 text-sky-600 sm:h-16 sm:w-16">
              <ShieldCheck className="h-8 w-8" strokeWidth={1.7} />
            </div>
            <div>
              <h2 id={titleId} className="text-[23px] font-semibold leading-tight tracking-tight text-slate-950 sm:text-[30px]">
                Tu conocimiento, protegido.
              </h2>
              <p className="mt-1.5 max-w-[630px] text-xs leading-5 text-slate-500 sm:text-sm sm:leading-6">
                Una infraestructura de confianza para que tu empresa pueda trabajar con tranquilidad.
              </p>
            </div>
          </div>
        </header>

        <div className="overflow-y-auto overscroll-contain px-5 py-6 sm:px-8 sm:py-7">
          <InfrastructureSection />

          <div className="mt-8 flex items-start gap-3 rounded-2xl border border-sky-100 bg-sky-50/70 p-4">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
            <p className="text-[11px] leading-5 text-slate-600 sm:text-xs">
              Las marcas pertenecen a sus respectivos titulares y se muestran como referencias públicas de los proveedores, no como clientes de CRS LAB. No implican afiliación, patrocinio ni respaldo a nuestra plataforma. Las certificaciones de Vercel y Neon corresponden a sus propios servicios, no a CRS LAB.
            </p>
          </div>
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 bg-white px-5 py-4 sm:px-8">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-sky-600" />
            <span className="text-[11px] font-semibold text-slate-700">CRS LAB</span>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl bg-slate-950 px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500">
            Entendido
          </button>
        </footer>
      </section>
    </div>
  );
}
