// app/(app)/notifications/page.tsx

import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import {
  Bell,
  CheckCircle2,
  Inbox,
  Mail,
} from "lucide-react";

import { auth } from "@/auth";
import {
  AppSectionShell,
} from "@/components/app/section-sidebar";
import { NotificationsPageContent } from "@/components/notifications/notifications-page-content";
import { getUserNotificationSummary } from "@/lib/services/notification.service";

export default async function NotificationsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  const notificationSummary =
    await getUserNotificationSummary(
      session.user.id,
    );

  return (
    <AppSectionShell
      sidebar={
        <NotificationsSidebar
          totalCount={
            notificationSummary.notifications.length
          }
          unreadCount={
            notificationSummary.unreadCount
          }
        />
      }
    >
      <NotificationsPageContent
        initialNotifications={
          notificationSummary.notifications
        }
        initialUnreadCount={
          notificationSummary.unreadCount
        }
      />
    </AppSectionShell>
  );
}

function NotificationsSidebar({
  totalCount,
  unreadCount,
}: {
  totalCount: number;
  unreadCount: number;
}) {
  const readCount = Math.max(
    0,
    totalCount - unreadCount,
  );

  return (
    <div className="space-y-6 p-4">
      <div>
        <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Bandeja
        </p>

        <div className="space-y-1">
          <SidebarMetric
            icon={<Inbox className="h-4 w-4" />}
            label="Todas"
            value={totalCount}
            active
          />

          <SidebarMetric
            icon={<Mail className="h-4 w-4" />}
            label="Sin leer"
            value={unreadCount}
          />

          <SidebarMetric
            icon={
              <CheckCircle2 className="h-4 w-4" />
            }
            label="Leídas"
            value={readCount}
          />
        </div>
      </div>

      <div className="rounded-xl border border-blue-100 bg-white/70 p-4">
        <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-[#EDF3FF] text-[#0A58FF]">
          <Bell className="h-4 w-4" />
        </div>

        <p className="text-sm font-semibold text-slate-900">
          Campana y bandeja
        </p>

        <p className="mt-1 text-xs leading-5 text-slate-500">
          La campana muestra lo reciente. Esta bandeja
          conserva todo el historial recibido.
        </p>
      </div>
    </div>
  );
}

function SidebarMetric({
  icon,
  label,
  value,
  active = false,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  active?: boolean;
}) {
  return (
    <div
      className={[
        "flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors",
        active
          ? "bg-[#EDF3FF] font-medium text-[#0A58FF]"
          : "text-slate-600 hover:bg-white/60 hover:text-slate-900",
      ].join(" ")}
    >
      <span className="flex items-center gap-2">
        {icon}
        {label}
      </span>

      <span
        className={[
          "text-xs font-medium",
          active
            ? "text-[#0A58FF]"
            : "text-slate-400",
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  );
}