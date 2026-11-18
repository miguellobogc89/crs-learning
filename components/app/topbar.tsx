
// components/app/topbar.tsx

"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  ChevronDown,
  CircleHelp,
  LogOut,
  Menu,
  Plus,
  Settings,
  UserCircle,
} from "lucide-react";

import { logout } from "@/app/actions/auth";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { MobileAppHeader } from "@/components/platform/mobile-app-header";
import { APP_SECTIONS } from "@/lib/navigation/app-sections";
import { GlobalSearch } from "@/components/search/global-search";
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
  activeWorkspace?: AccessibleWorkspace;
  workspaces?: AccessibleWorkspace[];
};

type UploadType = "files" | "folder" | "zip";

function requestKnowledgeUpload(type: UploadType) {
  window.dispatchEvent(
    new CustomEvent<UploadType>("crs:knowledge-upload", {
      detail: type,
    }),
  );
}

export function AppTopbar({
  user,
  notifications,
  unreadNotificationCount,
}: Props) {
  const pathname = usePathname();
  const userLabel = user.name ?? user.email ?? "Usuario";
  const isKnowledge = pathname.startsWith("/knowledge");
  const appSection = Object.values(APP_SECTIONS).find((item) => pathname === item.href || pathname.startsWith(item.href + "/"));
  const firstLevel = pathname.split("/").filter(Boolean).length === 1;
  const primary = firstLevel && !["/settings", "/notifications", "/my-space", "/admin"].includes(pathname);
  const mobileTitle = pathname === "/notifications"
    ? "Notificaciones"
    : pathname === "/settings"
      ? "Configuración"
      : pathname === "/my-space"
        ? "Mi espacio"
        : firstLevel
          ? appSection?.label ?? "CRS LAB"
          : pathname.endsWith("/new")
            ? "Nuevo"
            : "Detalle";
  const backHref = appSection?.href && appSection.href !== pathname ? appSection.href : "/dashboard";

  return (
    <>
      <MobileAppHeader
        primary={primary}
        menuControl={
          <SheetTrigger asChild>
            <button type="button" aria-label="Abrir el menú" className="flex size-11 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100 active:bg-slate-100">
              <Menu className="size-5" />
            </button>
          </SheetTrigger>
        }
        backHref={backHref}
        title={<span className="truncate">{mobileTitle}</span>}
        right={
          pathname === "/notifications" ? (
            <Bell className="size-5 text-slate-500" aria-hidden="true" />
          ) : (
            <Link href="/notifications" aria-label="Notificaciones" className="relative flex size-11 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100">
              <Bell className="size-5" />
              {unreadNotificationCount > 0 && (
                <span className="absolute right-1 top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                  {unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}
                </span>
              )}
            </Link>
          )
        }
      />
      <header className="relative z-50 hidden h-[68px] shrink-0 items-start gap-3 bg-transparent px-page-padding-sm pt-3 sm:px-page-padding-md md:flex lg:px-page-padding-lg">
  <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Abrir navegación"
          className="flex size-control-lg shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-white/70 lg:hidden"
        >
          <Menu className="size-icon-xl" />
        </button>
      </SheetTrigger>

      <div className="flex min-w-0 flex-1 items-center">
        <div
          className="
            h-control-xl w-full max-w-[470px] rounded-2xl bg-white
            shadow-[0_1px_2px_rgba(30,64,175,0.03)]
            lg:fixed lg:left-1/2 lg:top-3
lg:z-10 lg:w-[min(470px,calc(100vw-760px))]
lg:-translate-x-1/2
          "
        >
          {!pathname.startsWith("/finanzas") && <GlobalSearch />}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2.5">
        <div className="flex size-control-lg items-center justify-center rounded-xl border border-[#e5eaf5] bg-white shadow-[0_2px_5px_rgba(30,64,175,0.05)]">
          <NotificationBell
            initialNotifications={notifications}
            initialUnreadCount={unreadNotificationCount}
          />
        </div>

        <Link
          href="/settings"
          aria-label="Ayuda"
          title="Ayuda"
          className="flex size-control-lg items-center justify-center rounded-xl border border-[#e5eaf5] bg-white text-[#64748b] shadow-[0_2px_5px_rgba(30,64,175,0.05)] transition-colors hover:text-[#2563eb]"
        >
          <CircleHelp className="size-icon-lg" />
        </Link>

        {isKnowledge ? (
          <DropdownMenu>

            <DropdownMenuContent
              align="end"
              sideOffset={8}
              className="w-52"
            >
              <DropdownMenuItem
                onSelect={() => requestKnowledgeUpload("files")}
              >
                Subir archivos
              </DropdownMenuItem>

              <DropdownMenuItem
                onSelect={() => requestKnowledgeUpload("folder")}
              >
                Subir carpeta
              </DropdownMenuItem>

              <DropdownMenuItem
                onSelect={() => requestKnowledgeUpload("zip")}
              >
                Subir ZIP
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Abrir menú de usuario"
              className="flex size-control-lg shrink-0 items-center justify-center rounded-full p-1 text-muted-foreground transition-colors hover:bg-white/70"
            >
              {user.image ? (
                <Image
                  src={user.image}
                  alt={userLabel}
                  width={32}
                  height={32}
                  className="size-8 rounded-full object-cover"
                />
              ) : (
                <UserCircle className="size-7" />
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
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface text-muted-foreground">
                  {user.image ? (
                    <Image
                      src={user.image}
                      alt={userLabel}
                      width={36}
                      height={36}
                      className="size-9 rounded-full object-cover"
                    />
                  ) : (
                    <UserCircle className="size-6" />
                  )}
                </span>

                <div className="min-w-0">
                  <p className="truncate text-body-small font-medium text-foreground">
                    {user.name ?? "Usuario"}
                  </p>

                  {user.email ? (
                    <p className="truncate text-caption text-muted-foreground">
                      {user.email}
                    </p>
                  ) : null}
                </div>
              </div>
            </DropdownMenuLabel>

            <DropdownMenuSeparator />

            <DropdownMenuItem asChild>
              <Link href="/my-space" className="cursor-pointer">
                <UserCircle className="mr-2 size-icon-md" />
                Mi espacio
              </Link>
            </DropdownMenuItem>

            <DropdownMenuItem asChild>
              <Link href="/settings" className="cursor-pointer">
                <Settings className="mr-2 size-icon-md" />
                Configuración
              </Link>
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <form action={logout}>
              <DropdownMenuItem asChild variant="destructive">
                <button
                  type="submit"
                  className="w-full cursor-pointer"
                >
                  <LogOut className="mr-2 size-icon-md" />
                  Cerrar sesión
                </button>
              </DropdownMenuItem>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      </header>
    </>
  );
}
