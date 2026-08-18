// components/app/topbar.tsx
"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { UserCircle } from "lucide-react";

import { logout } from "@/app/actions/auth";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { GlobalSearch } from "@/components/search/global-search";
import { WorkspaceSelector } from "@/components/workspace/workspace-selector";
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
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border bg-white px-5">
      <div className="flex shrink-0 items-center gap-3">
        <WorkspaceSelector
          activeWorkspace={activeWorkspace}
          workspaces={workspaces}
        />

        <div className="h-5 w-px bg-border" />

        <span className="text-sm font-medium text-foreground">
          {sectionLabel}
        </span>
      </div>

      <div className="flex min-w-0 flex-1 justify-center px-6">
        <div className="w-full max-w-2xl">
          <GlobalSearch />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <NotificationBell
          initialNotifications={notifications}
          initialUnreadCount={unreadNotificationCount}
        />

        <form action={logout}>
          <button
            type="submit"
            aria-label="Cerrar sesión"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
          >
            {user.image ? (
              <Image
                src={user.image}
                alt={userLabel}
                width={28}
                height={28}
                className="h-7 w-7 rounded-full object-cover"
              />
            ) : (
              <UserCircle className="h-6 w-6" />
            )}
          </button>
        </form>
      </div>
    </header>
  );
}
