// components/app/topbar.tsx
"use client";

import Link from "next/link";
import { Eye, Save, ChevronLeft } from "lucide-react";
import { logout } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

type Props = {
  user: {
    name?: string | null;
    email?: string | null;
  };
};

export function AppTopbar({ user }: Props) {
  return (
    <header className="flex h-[68px] items-center justify-between border-b border-slate-800 bg-[#0b0f14] px-7">
      <div className="flex items-center gap-4">
        <Link
          href="/courses"
          className="flex items-center gap-2 text-slate-400 hover:text-white"
        >
          <ChevronLeft size={18} />
          <span>Cursos</span>
        </Link>

        <span className="text-slate-600">/</span>

        <span className="font-semibold text-white">
          CRS Learning
        </span>

        <span className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-medium uppercase tracking-wide text-slate-400">
          Borrador
        </span>
      </div>

      <div className="flex items-center gap-4">
        <button className="flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-white">
          <Eye size={18} />
          Previsualizar
        </button>

        <Button className="gap-2 bg-cyan-400 text-slate-950 hover:bg-cyan-300">
          <Save size={18} />
          Guardar
        </Button>

        <form action={logout}>
          <button className="text-sm text-slate-500 hover:text-white">
            {user.name ?? user.email}
          </button>
        </form>
      </div>
    </header>
  );
}