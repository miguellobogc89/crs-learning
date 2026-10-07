// components/home/navigation/home-navigation.tsx

"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import {
  HOME_SECTIONS,
  getHomeSection,
  homeHref,
} from "@/lib/navigation/home-sections";
import { cn } from "@/lib/utils";

export function HomeNavigation() {
  const searchParams = useSearchParams();

  const activeSection = getHomeSection(
    searchParams.get("view") ?? undefined,
  );

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="border-b border-slate-200/60 px-4 py-4">
        <h2 className="text-[13px] font-semibold text-slate-900">
          Inicio
        </h2>
      </div>

      <nav
        aria-label="Inicio"
        className="space-y-1 p-3"
      >
        {HOME_SECTIONS.map(
          ({
            id,
            label,
            icon: Icon,
          }) => {
            const active =
              activeSection.id === id;

            return (
              <Link
                key={id}
                href={homeHref(id)}
                aria-current={
                  active
                    ? "page"
                    : undefined
                }
                className={cn(
                  "group flex min-h-9 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                  active
                    ? "bg-[#EDF3FF] text-[#0A58FF]"
                    : "text-slate-600 hover:bg-[#F0F4FC] hover:text-slate-900",
                )}
              >
                <Icon
                  aria-hidden="true"
                  strokeWidth={2.4}
                  className={cn(
                    "h-[18px] w-[18px] shrink-0",
                    !active &&
                      "text-slate-500 group-hover:text-[#0A58FF]",
                  )}
                />

                <span className="min-w-0 truncate">
                  {label}
                </span>
              </Link>
            );
          },
        )}
      </nav>
    </div>
  );
}