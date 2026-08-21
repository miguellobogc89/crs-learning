"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { Bell, CheckCheck } from "lucide-react";
import { toast } from "sonner";

import {
  getNotificationSummaryAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/app/actions/notifications.actions";
import { NotificationList } from "@/components/notifications/notification-list";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { NotificationItem } from "@/lib/services/notification.service";

type NotificationBellProps = {
  initialNotifications: NotificationItem[];
  initialUnreadCount: number;
};

export function NotificationBell({
  initialNotifications,
  initialUnreadCount,
}: NotificationBellProps) {
  const router = useRouter();
  const [isPending, startTransition] =
    useTransition();
  const [notifications, setNotifications] =
    useState(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(
    initialUnreadCount,
  );
  const knownNotificationIds = useRef(
    new Set(
      initialNotifications.map(
        (notification) => notification.id,
      ),
    ),
  );

  const badgeLabel =
    unreadCount > 9 ? "9+" : String(unreadCount);

  useEffect(() => {
    let cancelled = false;

    async function refreshNotifications() {
      try {
        const summary =
          await getNotificationSummaryAction({
            take: 6,
          });

        if (cancelled) {
          return;
        }

        const newNotifications =
          summary.notifications.filter(
            (notification) =>
              !knownNotificationIds.current.has(
                notification.id,
              ),
          );

        setNotifications(summary.notifications);
        setUnreadCount(summary.unreadCount);

        summary.notifications.forEach(
          (notification) => {
            knownNotificationIds.current.add(
              notification.id,
            );
          },
        );

        if (newNotifications.length > 0) {
          const latestNotification =
            newNotifications[0];

          toast(latestNotification.title, {
            description:
              latestNotification.body ??
              "Tienes una nueva notificacion.",
            className:
              "border border-border bg-background text-foreground shadow-lg",
          });
        }
      } catch {
        // El usuario puede cerrar sesion o perder conectividad; el siguiente ciclo reintentara.
      }
    }

    const interval = window.setInterval(
      refreshNotifications,
      15000,
    );

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  function markNotificationRead(
    notification: NotificationItem,
  ) {
    if (notification.readAt !== null) {
      if (notification.href) {
        router.push(notification.href);
      }

      return;
    }

    setNotifications((current) =>
      current.map((item) =>
        item.id === notification.id
          ? {
              ...item,
              readAt: new Date().toISOString(),
            }
          : item,
      ),
    );
    setUnreadCount((current) =>
      Math.max(0, current - 1),
    );

    startTransition(async () => {
      await markNotificationReadAction(
        notification.id,
      );

      if (notification.href) {
        router.push(notification.href);
      }

      router.refresh();
    });
  }

  function markAllRead() {
    if (unreadCount === 0) {
      return;
    }

    const now = new Date().toISOString();

    setNotifications((current) =>
      current.map((item) => ({
        ...item,
        readAt: item.readAt ?? now,
      })),
    );
    setUnreadCount(0);

    startTransition(async () => {
      await markAllNotificationsReadAction();
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative flex h-full aspect-square items-center justify-center rounded-md text-muted-foreground hover:bg-surface hover:text-foreground"
          aria-label="Notificaciones"
        >
          <Bell className="h-4 w-4" />

          {unreadCount > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold leading-none text-brand-foreground">
              {badgeLabel}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-[360px] p-0"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <DropdownMenuLabel className="p-0 text-sm font-semibold text-foreground">
            Notificaciones
          </DropdownMenuLabel>

          {unreadCount > 0 ? (
            <button
              type="button"
              disabled={isPending}
              onClick={markAllRead}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-surface hover:text-foreground disabled:opacity-60"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Marcar todas como leidas
            </button>
          ) : null}
        </div>

        <DropdownMenuSeparator className="m-0" />

        <div className="max-h-[420px] overflow-y-auto">
          <NotificationList
            notifications={notifications.slice(0, 6)}
            compact
            onNotificationClick={markNotificationRead}
          />
        </div>

        <DropdownMenuSeparator className="m-0" />

        <DropdownMenuItem asChild>
          <Link
            href="/notifications"
            className="justify-center py-2.5 text-sm font-medium"
          >
            Ver todas las notificaciones
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
