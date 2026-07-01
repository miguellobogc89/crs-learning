// components/app/sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  GraduationCap,
  Grid2X2,
  Home,
  Settings,
  User,
} from "lucide-react";

const navItems = [
  {
    href: "/dashboard",
    icon: Home,
    label: "Dashboard",
  },
  {
    href: "/courses",
    icon: GraduationCap,
    label: "Cursos",
  },
  {
    href: "/achievements",
    icon: Grid2X2,
    label: "Logros",
  },
  {
    href: "/profile",
    icon: User,
    label: "Perfil",
  },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-20 flex-col items-center border-r border-slate-800 bg-[#070b10] py-5">
      <Link
        href="/dashboard"
        className="mb-8 flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400"
      >
        <BookOpen size={23} />
      </Link>

      <nav className="flex flex-1 flex-col items-center gap-3">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`flex h-12 w-12 items-center justify-center rounded-xl transition ${
                active
                  ? "bg-slate-800 text-white"
                  : "text-slate-500 hover:bg-slate-900 hover:text-slate-200"
              }`}
            >
              <item.icon size={22} />
            </Link>
          );
        })}
      </nav>

      <Link
        href="/settings"
        title="Configuración"
        className="flex h-12 w-12 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-900 hover:text-slate-200"
      >
        <Settings size={22} />
      </Link>
    </aside>
  );
}