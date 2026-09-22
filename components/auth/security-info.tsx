// components/auth/security-info.tsx

"use client";

import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Database,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";

import { SecurityModal } from "./security-modal/security-modal";

type SecurityInfoProps = {
  variant: "sidebar" | "login";
};

export function SecurityInfo({ variant }: SecurityInfoProps) {
  const [open, setOpen] = useState(false);

  if (variant === "sidebar") {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group flex w-full items-center gap-4 rounded-2xl border border-brand-border/70 bg-brand-soft/50 p-4 text-left transition-all duration-200 hover:border-brand/40 hover:bg-brand-soft"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-brand-border/50 bg-brand-soft text-brand">
            <ShieldCheck className="h-6 w-6" strokeWidth={1.8} />
          </div>

          <div className="min-w-0 flex-1 border-l border-brand-border/70 pl-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">
                Seguridad y protección de datos
              </span>

              <ArrowUpRight className="h-4 w-4 shrink-0 text-brand transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </div>

            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Conoce cómo protegemos la información de tu empresa.
            </p>
          </div>
        </button>

        <SecurityModal open={open} onClose={() => setOpen(false)} />
      </>
    );
  }

  return (
    <>
      <div className="mt-10 rounded-2xl border border-brand-border/60 bg-brand-soft/30 p-4 sm:p-5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group flex w-full items-center gap-4 text-left"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-brand-border/50 bg-brand-soft text-brand">
            <ShieldCheck className="h-6 w-6" strokeWidth={1.8} />
          </div>

          <div className="min-w-0 flex-1 border-l border-brand-border/70 pl-4">
            <h3 className="text-sm font-semibold tracking-tight">
              Tu conocimiento, protegido
            </h3>

            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Descubre cómo protegemos tu información.
            </p>
          </div>

          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-brand transition-colors group-hover:bg-brand-soft">
            <ArrowRight className="h-5 w-5" />
          </div>
        </button>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-brand-border/40 pt-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <LockKeyhole className="h-3.5 w-3.5 text-brand" />
              <span className="text-[11px]">
                Comunicaciones cifradas
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Database className="h-3.5 w-3.5 text-brand" />
              <span className="text-[11px]">
                Infraestructura de datos
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex items-center gap-1.5 text-xs font-semibold transition-opacity hover:opacity-60"
              aria-label="Consultar información sobre Vercel"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5 fill-current"
                aria-hidden="true"
              >
                <path d="M12 2 24 22H0L12 2Z" />
              </svg>
              Vercel
            </button>

            <span className="h-4 w-px bg-border" />

            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex items-center gap-1.5 text-xs font-semibold transition-opacity hover:opacity-60"
              aria-label="Consultar información sobre Neon"
            >
              <Database className="h-3.5 w-3.5 text-emerald-500" />
              Neon
            </button>
          </div>
        </div>
      </div>

      <SecurityModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}