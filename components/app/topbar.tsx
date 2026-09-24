// components/app/topbar.tsx


"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
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
  activeWorkspace: AccessibleWorkspace;
  workspaces: AccessibleWorkspace[];
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

  return (
    <header className="flex h-[68px] shrink-0 items-center gap-3 border-0 bg-transparent px-4 sm:px-6 lg:px-8">
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Abrir navegación"
          className="flex size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-white/70 lg:hidden"
        >
          <Menu className="size-5" />
        </button>
      </SheetTrigger>


<div className="flex min-w-0 flex-1 items-center">
  <div
    className="
      h-11 w-full max-w-[470px] rounded-2xl bg-white
      shadow-[0_1px_2px_rgba(30,64,175,0.03)]
      lg:fixed lg:left-1/2 lg:top-[34px]
      lg:z-10 lg:w-[min(470px,calc(100vw-760px))]
      lg:-translate-x-1/2 lg:-translate-y-1/2
    "
  >
    <GlobalSearch />
  </div>
</div>

      <div className="flex shrink-0 items-center gap-2.5">
        <div className="flex size-10 items-center justify-center rounded-xl border border-[#e5eaf5] bg-white shadow-[0_2px_5px_rgba(30,64,175,0.05)]">
          <NotificationBell
            initialNotifications={notifications}
            initialUnreadCount={unreadNotificationCount}
          />
        </div>

        <Link
          href="/settings"
          aria-label="Ayuda"
          title="Ayuda"
          className="flex size-10 items-center justify-center rounded-xl border border-[#e5eaf5] bg-white text-[#64748b] shadow-[0_2px_5px_rgba(30,64,175,0.05)] transition-colors hover:text-[#2563eb]"
        >
          <CircleHelp className="size-[19px]" />
        </Link>

        {isKnowledge ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="ml-1 flex h-10 items-center gap-2 rounded-xl bg-[#316be9] px-3.5 text-sm font-semibold text-white shadow-[0_3px_8px_rgba(37,99,235,0.18)] transition-colors hover:bg-[#245bd4] sm:px-4"
              >
                <Plus className="size-4 shrink-0" />

                <span className="hidden sm:inline">
                  Añadir documento
                </span>

                <ChevronDown className="size-4 shrink-0 opacity-80" />
              </button>
            </DropdownMenuTrigger>

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
              className="flex size-10 shrink-0 items-center justify-center rounded-full p-1 text-muted-foreground transition-colors hover:bg-white/70"
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
              <Link href="/my-space" className="cursor-pointer">
                <UserCircle className="mr-2 size-4" />
                Mi espacio
              </Link>
            </DropdownMenuItem>

            <DropdownMenuItem asChild>
              <Link href="/settings" className="cursor-pointer">
                <Settings className="mr-2 size-4" />
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
                  <LogOut className="mr-2 size-4" />
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