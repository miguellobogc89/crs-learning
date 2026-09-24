
// components/app/sidebar.tsx

"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SheetClose } from "@/components/ui/sheet";

import {
  GraduationCap,
  Home,
  Inbox,
  Library,
  Settings,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

import { cn } from "@/lib/utils";

type AppSidebarProps = {
  notificationCount?: number;
  mobile?: boolean;
  isAdmin?: boolean;
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
    disabled: true,
  },
  {
    href: "/notifications",
    icon: Inbox,
    label: "Bandeja",
    notifications: true,
  },
  {
    href: "/users",
    icon: UsersRound,
    label: "Usuarios",
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
        bg-foreground px-2.5 py-1.5
        text-xs font-medium text-background
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
  mobile = false,
  isAdmin = false,
}: AppSidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 flex-col justify-between bg-transparent pt-4 pb-3",
        mobile
          ? "w-full items-stretch px-4"
          : "hidden w-14 items-center lg:flex",
      )}
    >
      <div
        className={cn(
          "flex flex-col gap-1",
          mobile ? "items-stretch" : "items-center",
        )}
      >
        {/* Logo de Crusader */}
        <Link
          href="/knowledge"
          aria-label="Crusader"
          className={cn(
            "flex h-14 shrink-0 items-center justify-center",
            mobile
              ? "mb-3 w-full justify-start px-2"
              : "mb-5 w-14",
          )}
        >
<Image
  src="/logo/logo.png"
  alt="Crusader"
  width={32}
  height={32}
  className="h-8 w-8 object-contain"
  priority
/>

          {mobile ? (
            <span className="ml-3 text-sm font-semibold tracking-tight text-foreground">
              Crusader
            </span>
          ) : null}
        </Link>

        <nav
          className={cn(
            "flex flex-col gap-1",
            mobile ? "items-stretch" : "items-center",
          )}
        >
          {navItems.map((item) => {
            const active =
              !item.disabled &&
              pathname.startsWith(item.href);

            if (item.disabled) {
              return (
                <div
                  key={item.href}
                  aria-label={`${item.label} - Próximamente`}
                  aria-disabled="true"
                  className={cn(
                    "group relative flex h-9 cursor-default items-center rounded-md text-muted-foreground/40",
                    mobile
                      ? "w-full justify-start gap-3 px-3"
                      : "w-9 justify-center",
                  )}
                >
                  <item.icon className="h-[18px] w-[18px]" />

                  {mobile ? (
                    <>
                      <span>{item.label}</span>

                      <span className="ml-auto text-[10px] text-muted-foreground/60">
                        Próximamente
                      </span>
                    </>
                  ) : (
                    <SidebarTooltip
                      label={`${item.label} · Próximamente`}
                    />
                  )}
                </div>
              );
            }

            const link = (
              <Link
                href={item.href}
                aria-label={item.label}
                className={cn(
                  "group relative flex h-9 items-center rounded-md text-muted-foreground transition-colors hover:bg-surface hover:text-foreground",
                  mobile
                    ? "w-full justify-start gap-3 px-3"
                    : "w-9 justify-center",
                  active &&
                    "bg-[#EDF3FF] text-[#0A58FF] hover:bg-[#EDF3FF] hover:text-[#0A58FF]",
                )}
              >
                <item.icon className="h-[18px] w-[18px]" />

                {mobile ? (
                  <span>{item.label}</span>
                ) : null}

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
                        ring-2 ring-background
                      "
                    >
                      {notificationCount > 9
                        ? "9+"
                        : notificationCount}
                    </span>
                  )}

                {!mobile ? (
                  <SidebarTooltip label={item.label} />
                ) : null}
              </Link>
            );

            return mobile ? (
              <SheetClose key={item.href} asChild>
                {link}
              </SheetClose>
            ) : (
              <div key={item.href}>{link}</div>
            );
          })}
        </nav>
      </div>

      {mobile ? (
        <div className="flex flex-col items-stretch gap-1">
          {isAdmin && (
            <SheetClose asChild>
              <Link
                href="/admin"
                aria-label="Administración"
                className="
                  group relative flex h-9 w-full
                  items-center justify-start gap-3
                  rounded-md px-3 text-muted-foreground
                  transition-colors
                  hover:bg-surface hover:text-foreground
                "
              >
                <ShieldCheck className="h-[18px] w-[18px]" />
                <span>Administración</span>
              </Link>
            </SheetClose>
          )}

          <SheetClose asChild>
            <Link
              href="/settings"
              aria-label="Configuración"
              className="
                group relative flex h-9 w-full
                items-center justify-start gap-3
                rounded-md px-3 text-muted-foreground
                transition-colors
                hover:bg-surface hover:text-foreground
              "
            >
              <Settings className="h-[18px] w-[18px]" />
              <span>Configuración</span>
            </Link>
          </SheetClose>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1">
          {isAdmin && (
            <Link
              href="/admin"
              aria-label="Administración"
              className={cn(
                "group relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface hover:text-foreground",
                pathname.startsWith("/admin") &&
                  "bg-[#EDF3FF] text-[#0A58FF] hover:bg-[#EDF3FF] hover:text-[#0A58FF]",
              )}
            >
              <ShieldCheck className="h-[18px] w-[18px]" />
              <SidebarTooltip label="Administración" />
            </Link>
          )}

          <Link
            href="/settings"
            aria-label="Configuración"
            className={cn(
              "group relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface hover:text-foreground",
              pathname.startsWith("/settings") &&
                "bg-[#EDF3FF] text-[#0A58FF] hover:bg-[#EDF3FF] hover:text-[#0A58FF]",
            )}
          >
            <Settings className="h-[18px] w-[18px]" />
            <SidebarTooltip label="Configuración" />
          </Link>
        </div>
      )}
    </aside>
  );
}