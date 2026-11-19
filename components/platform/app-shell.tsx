"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, X } from "lucide-react";

import { AppModuleLinks } from "@/components/platform/app-navigation";
import { MobileAppHeader } from "@/components/platform/mobile-app-header";
import { AppNotificationButton } from "@/components/platform/notification-button";
import { NotificationsDrawer } from "@/components/platform/notifications-drawer";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import type { AppId } from "@/lib/platform/apps";

/** Interior visual compartido: menú, cabecera y avisos, sin sesión ni acceso a datos. */
export function AppShell({
  title,
  activeAppId,
  sectionNavigation,
  bottomNavigation,
  children,
}: {
  title: string;
  activeAppId?: AppId;
  sectionNavigation?: ReactNode;
  bottomNavigation?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [menuRoute, setMenuRoute] = useState<string | null>(null);
  const menuOpen = menuRoute === pathname;
  const setMenuOpen = (open: boolean) => setMenuRoute(open ? pathname : null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationButton = (
    <AppNotificationButton unread={0} onClick={() => setNotificationsOpen(true)} />
  );

  return (
    <div className="flex h-dvh min-h-0 w-full overflow-hidden bg-[#F8FAFC] text-slate-900">
      <aside className="hidden w-64 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white px-4 py-6 md:flex">
        <Link href="/apps" className="px-3 py-2 text-lg font-bold tracking-tight text-slate-950">CRS</Link>
        <div className="mt-7"><AppModuleLinks activeAppId={activeAppId} /></div>
        {sectionNavigation && <div className="mt-6 border-t border-slate-100 pt-5">{sectionNavigation}</div>}
        <p className="mt-auto px-3 pt-8 text-xs leading-5 text-slate-400">Estructura unificada · Sin datos conectados</p>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <MobileAppHeader
          title={title}
          primary
          onMenuClick={() => setMenuOpen(true)}
          right={notificationButton}
        />
        <header className="hidden h-20 shrink-0 grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-3 border-b border-slate-200 bg-white px-6 md:grid lg:px-10">
          <div />
          <h1 className="truncate text-center text-xl font-semibold tracking-tight">{title}</h1>
          {notificationButton}
        </header>
        <main className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pt-7 sm:px-6 lg:px-10 ${bottomNavigation ? "pb-24 md:pb-7" : "pb-7"}`}>
          <div className="mx-auto max-w-5xl">{children}</div>
        </main>
      </div>

      {bottomNavigation}

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" showCloseButton={false} className="gap-0 p-0 data-[side=left]:w-full data-[side=left]:sm:max-w-sm">
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-100 px-5">
            <SheetTitle className="font-semibold">CRS · Aplicaciones</SheetTitle>
            <button type="button" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú" className="flex size-10 items-center justify-center rounded-xl text-slate-500">
              <X className="size-5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <AppModuleLinks activeAppId={activeAppId} onNavigate={() => setMenuOpen(false)} />
            {sectionNavigation && <div className="mt-6 border-t border-slate-100 pt-5">{sectionNavigation}</div>}
          </div>
        </SheetContent>
      </Sheet>

      <NotificationsDrawer open={notificationsOpen} onClose={() => setNotificationsOpen(false)}>
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <Bell className="size-7 text-blue-600" />
          <p className="font-medium">Sin notificaciones</p>
          <p className="text-sm text-slate-500">Cada módulo conectará aquí sus propios avisos.</p>
        </div>
      </NotificationsDrawer>
    </div>
  );
}
