// components/app/topbar.tsx
"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LogOut,
  Menu,
  Settings,
  UserCircle,
} from "lucide-react";

import { logout } from "@/app/actions/auth";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { GlobalSearch } from "@/components/search/global-search";
import { WorkspaceSelector } from "@/components/workspace/workspace-selector";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SheetTrigger } from "@/components/ui/sheet";
import type { NotificationItem } from "@/lib/services/notification.service";
import type { AccessibleWorkspace } from "@/lib/repositories/workspace.repository";

type Props = {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  breadcrumb?: ReactNode;
  notifications: NotificationItem[];
  unreadNotificationCount: number;
  activeWorkspace: AccessibleWorkspace;
  workspaces: AccessibleWorkspace[];
};

const sectionLabels = [
  { path: "/dashboard", label: "Inicio" },
  { path: "/knowledge", label: "Conocimiento" },
  { path: "/courses", label: "Cursos" },
  { path: "/achievements", label: "Logros" },
  { path: "/notifications", label: "Bandeja" },
  { path: "/my-space", label: "Mi espacio" },
  { path: "/settings", label: "Configuración" },
];

export function AppTopbar({
  user,
  notifications,
  unreadNotificationCount,
  activeWorkspace,
  workspaces,
}: Props) {
  const pathname = usePathname();
  const userLabel = user.name ?? user.email ?? "Usuario";

  let sectionLabel = "Inicio";

  const currentSection = sectionLabels.find((section) =>
    pathname.startsWith(section.path),
  );

  if (currentSection) {
    sectionLabel = currentSection.label;
  }

  return (
    <header
      className="
        flex shrink-0 items-center gap-4
        border-b border-border
        bg-background px-3 py-2

        h-12
        sm:px-4 sm:py-2
        md:h-14 md:px-5 md:py-2.5
        lg:h-[58px] lg:px-6 lg:py-3
        xl:h-16 xl:px-7 xl:py-3
        2xl:h-[68px] 2xl:px-8 2xl:py-3.5
        [&_[data-search-shortcut]]:hidden
        lg:[&_[data-search-shortcut]]:inline-flex
      "
    >
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Abrir navegación"
          className="flex h-full aspect-square shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface hover:text-foreground lg:hidden"
        >
          <Menu className="size-5" />
        </button>
      </SheetTrigger>

      <div className="hidden h-full shrink-0 items-center gap-3 lg:flex">
        <WorkspaceSelector
          activeWorkspace={activeWorkspace}
          workspaces={workspaces}
        />

        <div className="my-3 w-px self-stretch bg-border" />

        <span className="text-sm font-medium text-foreground">
          {sectionLabel}
        </span>
      </div>

      <div className="flex h-full min-w-0 flex-1 justify-center px-2 md:px-4 lg:px-6">
        <div className="h-full w-full max-w-2xl">
          <GlobalSearch />
        </div>
      </div>

      <div className="flex h-full shrink-0 items-center gap-1.5 sm:gap-2">
        <NotificationBell
          initialNotifications={notifications}
          initialUnreadCount={unreadNotificationCount}
        />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Abrir menú de usuario"
              className="flex h-full aspect-square items-center justify-center rounded-full p-1 text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
            >
              {user.image ? (
                <Image
                  src={user.image}
                  alt={userLabel}
                  width={28}
                  height={28}
                  className="h-full w-full rounded-full object-cover"
                />
              ) : (
                <UserCircle className="h-full w-full" />
              )}
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="end"
            sideOffset={8}
            className="w-64"
          >
            <DropdownMenuLabel className="font-normal">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-muted-foreground">
                  {user.image ? (
                    <Image
                      src={user.image}
                      alt={userLabel}
                      width={36}
                      height={36}
                      className="h-full w-full rounded-full object-cover"
                    />
                  ) : (
                    <UserCircle className="h-full w-full" />
                  )}
                </span>

                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {user.name ?? "Usuario"}
                  </p>

                  {user.email ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {user.email}
                    </p>
                  ) : null}
                </div>
              </div>
            </DropdownMenuLabel>

            <DropdownMenuSeparator />

            <DropdownMenuItem asChild>
              <Link
                href="/my-space"
                className="cursor-pointer"
              >
                <UserCircle className="mr-2 h-4 w-4" />
                Mi espacio
              </Link>
            </DropdownMenuItem>

            <DropdownMenuItem asChild>
              <Link
                href="/settings"
                className="cursor-pointer"
              >
                <Settings className="mr-2 h-4 w-4" />
                Configuración
              </Link>
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <form action={logout}>
              <DropdownMenuItem
                asChild
                variant="destructive"
              >
                <button
                  type="submit"
                  className="w-full cursor-pointer"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Cerrar sesión
                </button>
              </DropdownMenuItem>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
