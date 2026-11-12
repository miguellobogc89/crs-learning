"use client";
// Secciones de Trading en pantallas pequeñas: en móvil la barra lateral no se ve, así que se navega con
// una tira de pestañas deslizable bajo el título. En escritorio (lg) no aparece.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { TRADING_TABS } from "./tabs";

export function TradingMobileTabs() {
  const pathname = usePathname();
  const active = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    active.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname]);

  return (
    <nav aria-label="Secciones de Trading" className="-mx-5 mt-3 overflow-x-auto px-5 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:hidden [&::-webkit-scrollbar]:hidden">
      <div className="flex w-max gap-2 pb-1">
        {TRADING_TABS.map((t) => {
          const href = t.key === "mercados" ? "/trading/mercados?tab=valores" : `/trading/${t.key}`;
          const on = pathname === `/trading/${t.key}` || (t.key === "inicio" && pathname === "/trading");
          const Icon = t.icon;
          return (
            <Link
              key={t.key}
              ref={on ? active : undefined}
              href={href}
              aria-current={on ? "page" : undefined}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                on ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 active:bg-slate-50"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
