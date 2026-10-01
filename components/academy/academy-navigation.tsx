"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SheetClose } from "@/components/ui/sheet";
import { ACADEMY_SECTIONS, academyHref } from "@/lib/navigation/academy-sections";
import { cn } from "@/lib/utils";

export function AcademyNavigation({ mobile = false }: { mobile?: boolean }) {
  const searchParams = useSearchParams();
  const selected = searchParams.get("view") ?? "home";
  const activeId = ACADEMY_SECTIONS.some((item) => item.id === selected)
    ? selected : "home";

  return (
    <nav aria-label="Academy" className="space-y-1">
      {ACADEMY_SECTIONS.map(({ id, label, icon: Icon }) => {
        const active = activeId === id;
        const link = (
          <Link
            href={academyHref(id)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex min-h-9 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
              active
                ? "bg-[#EDF3FF] text-[#0A58FF]"
                : "text-slate-600 hover:bg-[#F0F4FC] hover:text-slate-900",
            )}
          >
            <Icon aria-hidden="true" strokeWidth={2.4} className={cn(
              "h-[18px] w-[18px] shrink-0",
              !active && "text-slate-500 group-hover:text-[#0A58FF]",
            )} />
            <span className="min-w-0 truncate">{label}</span>
          </Link>
        );
        return mobile ? (
          <SheetClose key={id} asChild>{link}</SheetClose>
        ) : <div key={id}>{link}</div>;
      })}
    </nav>
  );
}

export function AcademySidebar() {
  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="border-b border-slate-200/60 px-4 py-4">
        <h2 className="text-[13px] font-semibold text-slate-900">Academy</h2>
      </div>
      <div className="p-3"><AcademyNavigation /></div>
    </div>
  );
}
