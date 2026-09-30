// components/auth/security-info.tsx

"use client";

import { useState } from "react";
import {
  ArrowUpRight,
  ShieldCheck,
} from "lucide-react";

import { SecurityModal } from "./security-modal/security-modal";

export function SecurityInfo() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex w-full items-center gap-4 rounded-2xl border border-[#0A58FF]/20 bg-[#0A58FF]/[0.05] p-4 text-left transition-all duration-200 hover:border-[#0A58FF]/40 hover:bg-[#0A58FF]/10"
      >
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#0A58FF]/20 bg-[#0A58FF]/10 text-[#0A58FF]">
          <ShieldCheck
            className="h-6 w-6"
            strokeWidth={1.8}
          />
        </div>

        <div className="min-w-0 flex-1 border-l border-[#0A58FF]/20 pl-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">
              Seguridad y protección de datos
            </span>

            <ArrowUpRight className="h-4 w-4 shrink-0 text-[#0A58FF] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </div>

          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Conoce cómo protegemos la información de tu empresa.
          </p>
        </div>
      </button>

      <SecurityModal
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}