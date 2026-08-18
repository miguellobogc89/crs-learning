// components/app/sidebar.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  GraduationCap,
  Grid2X2,
  Home,
  Inbox,
  Library,
  Settings,
  UserRound,
} from "lucide-react";

import { cn } from "@/lib/utils";

type AppSidebarProps = {
  notificationCount?: number;
};

const navItems = [
  {
    href: "/dashboard",
    icon: Home,
    label: "Dashboard",
  },
  {
    href: "/knowledge",
    icon: Library,
    label: "Conocimiento",
  },
  {
    href: "/courses",
    icon: GraduationCap,
    label: "Cursos",
    premium: true,
  },
  {
    href: "/achievements",
    icon: Grid2X2,
    label: "Logros",
  },
  {
    href: "/notifications",
    icon: Inbox,
    label: "Bandeja",
    notifications: true,
  },
  {
    href: "/my-space",
    icon: UserRound,
    label: "Mi espacio",
  },
];

function SidebarTooltip({
  label,
}: {
  label: string;
}) {
  return (
    <span
      className="
        pointer-events-none
        absolute left-full top-1/2 z-50 ml-2
        -translate-x-1 -translate-y-1/2
        whitespace-nowrap rounded-md
        bg-blue-600 px-2.5 py-1.5
        text-xs font-medium text-white
        opacity-0 shadow-lg
        transition-all duration-150 ease-out
        group-hover:translate-x-0
        group-hover:opacity-100
      "
    >
      {label}
    </span>
  );
}

export function AppSidebar({
  notificationCount = 0,
}: AppSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-14 flex-col items-center justify-between border-r border-border bg-white py-3">
      <div className="flex flex-col items-center gap-1">
        <Link
          href="/knowledge"
          aria-label="CRS Learning"
          className="mb-3 flex h-9 w-9 items-center justify-center"
        >
          <Image
            src="/logo/logo.png"
            alt="CRS Learning"
width={26}
height={26}
className="h-[26px] w-[26px] object-contain"
            priority
          />
        </Link>

        <nav className="flex flex-col items-center gap-1">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                className={cn(
                  "group relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface hover:text-foreground",
                  active && "bg-surface text-foreground",
                )}
              >
                <item.icon className="h-[18px] w-[18px]" />

                {item.notifications &&
                  notificationCount > 0 && (
                    <span
                      className="
                        absolute right-[3px] top-[3px]
                        flex min-h-3.5 min-w-3.5
                        items-center justify-center
                        rounded-full bg-red-500
                        px-1 text-[9px] font-semibold
                        leading-none text-white
                        ring-2 ring-white
                      "
                    >
                      {notificationCount > 9
                        ? "9+"
                        : notificationCount}
                    </span>
                  )}

                  {item.premium && (
                    <span className="absolute right-[1px] top-[1px] flex h-4 w-4 items-center justify-center">
                      <Image
                        src="/icons/subscription/diamond.png"
                        alt=""
                        width={16}
                        height={16}
                        className="h-4 w-4 object-contain"
                      />
                    </span>
                  )}

                <SidebarTooltip label={item.label} />
              </Link>
            );
          })}
        </nav>
      </div>

      <Link
        href="/settings"
        aria-label="Configuración"
        className="group relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
      >
        <Settings className="h-[18px] w-[18px]" />

        <SidebarTooltip label="Configuración" />
      </Link>
    </aside>
  );
}