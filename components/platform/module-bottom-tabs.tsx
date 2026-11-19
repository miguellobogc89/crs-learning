"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";

type ModuleTab = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
};

/** Barra inferior común, configurable por cada módulo. */
export function ModuleBottomTabs({ tabs }: { tabs: readonly ModuleTab[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Secciones" className="fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200/70 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {tabs.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-label={tab.label}
            aria-current={active ? "page" : undefined}
            className={`flex h-14 min-w-0 flex-1 items-center justify-center ${active ? "text-blue-600" : "text-slate-400 active:text-slate-600"}`}
          >
            <tab.icon className="h-6 w-6" strokeWidth={active ? 2.4 : 2} />
          </Link>
        );
      })}
    </nav>
  );
}
