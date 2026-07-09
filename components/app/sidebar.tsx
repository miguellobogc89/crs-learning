// components/app/sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  GraduationCap,
  Grid2X2,
  Home,
  Library,
  Settings,
  UserRound,
} from "lucide-react";

import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", icon: Home, label: "Dashboard" },
  { href: "/knowledge", icon: Library, label: "Knowledge Hub" },
  { href: "/courses", icon: GraduationCap, label: "Cursos" },
  { href: "/achievements", icon: Grid2X2, label: "Logros" },
  { href: "/my-space", icon: UserRound, label: "Mi espacio" },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-14 flex-col items-center justify-between border-r border-border bg-white py-3">
      <div className="flex flex-col items-center gap-1">
        <Link
          href="/dashboard"
          className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-brand-soft text-brand"
        >
          <BookOpen className="h-[18px] w-[18px]" />
        </Link>

        <nav className="flex flex-col items-center gap-1">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface hover:text-foreground",
                  active && "bg-surface text-foreground",
                )}
              >
                <item.icon className="h-[18px] w-[18px]" />
              </Link>
            );
          })}
        </nav>
      </div>

      <Link
        href="/settings"
        title="Configuración"
        className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
      >
        <Settings className="h-[18px] w-[18px]" />
      </Link>
    </aside>
  );
}