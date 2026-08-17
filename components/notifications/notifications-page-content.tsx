"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import type {
  MouseEventHandler,
  ReactNode,
} from "react";
import {
  CheckCheck,
  Clock3,
  ExternalLink,
  Inbox,
  Mail,
  MailOpen,
  Trash2,
} from "lucide-react";

import {
  deleteNotificationAction,
  getNotificationSummaryAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
  markNotificationUnreadAction,
} from "@/app/actions/notifications.actions";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/components/notifications/notification-list";
import type { NotificationItem } from "@/lib/services/notification.service";
import { cn } from "@/lib/utils";

type NotificationsPageContentProps = {
  initialNotifications: NotificationItem[];
  initialUnreadCount: number;
};

export function NotificationsPageContent({
  initialNotifications,
  initialUnreadCount,
}: NotificationsPageContentProps) {
  const router = useRouter();
  const [isPending, startTransition] =
    useTransition();
  const [notifications, setNotifications] =
    useState(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(
    initialUnreadCount,
  );
  const [expandedId, setExpandedId] = useState<
    string | null
  >(null);
  const snapshotRef = useRef(
    buildNotificationSnapshot(
      initialNotifications,
      initialUnreadCount,
    ),
  );

  useEffect(() => {
    let cancelled = false;

    async function refreshNotifications() {
      try {
        const summary =
          await getNotificationSummaryAction();

        if (cancelled) {
          return;
        }

        setNotifications(summary.notifications);
        setUnreadCount(summary.unreadCount);

        const nextSnapshot =
          buildNotificationSnapshot(
            summary.notifications,
            summary.unreadCount,
          );

        if (nextSnapshot !== snapshotRef.current) {
          snapshotRef.current = nextSnapshot;
          router.refresh();
        }

        if (
          expandedId &&
          !summary.notifications.some(
            (notification) =>
              notification.id === expandedId,
          )
        ) {
          setExpandedId(null);
        }
      } catch {
        // Reintenta en el siguiente ciclo.
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
  }, [expandedId]);

  function updateReadState(
    notificationId: string,
    readAt: string | null,
  ) {
    setNotifications((current) =>
      current.map((item) =>
        item.id === notificationId
          ? {
              ...item,
              readAt,
            }
          : item,
      ),
    );
  }

  function openNotification(
    notification: NotificationItem,
  ) {
    setExpandedId((current) =>
      current === notification.id
        ? null
        : notification.id,
    );

    if (notification.readAt !== null) {
      return;
    }

    updateReadState(
      notification.id,
      new Date().toISOString(),
    );
    setUnreadCount((current) =>
      Math.max(0, current - 1),
    );

    startTransition(async () => {
      await markNotificationReadAction(
        notification.id,
      );
      router.refresh();
    });
  }

  function markRead(notification: NotificationItem) {
    if (notification.readAt !== null) {
      return;
    }

    updateReadState(
      notification.id,
      new Date().toISOString(),
    );
    setUnreadCount((current) =>
      Math.max(0, current - 1),
    );

    startTransition(async () => {
      await markNotificationReadAction(
        notification.id,
      );
      router.refresh();
    });
  }

  function markUnread(notification: NotificationItem) {
    if (notification.readAt === null) {
      return;
    }

    updateReadState(notification.id, null);
    setUnreadCount((current) => current + 1);

    startTransition(async () => {
      await markNotificationUnreadAction(
        notification.id,
      );
      router.refresh();
    });
  }

  function deleteNotification(
    notification: NotificationItem,
  ) {
    const wasUnread = notification.readAt === null;

    setNotifications((current) =>
      current.filter(
        (item) => item.id !== notification.id,
      ),
    );
    setUnreadCount((current) =>
      wasUnread ? Math.max(0, current - 1) : current,
    );

    if (expandedId === notification.id) {
      setExpandedId(null);
    }

    startTransition(async () => {
      await deleteNotificationAction(
        notification.id,
      );
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
    <main className="h-full min-h-0 bg-background">
      <section className="h-full min-h-0 overflow-y-auto">
        <div className="border-b border-border bg-background px-8 py-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Historial
              </p>

              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                Bandeja
              </h1>

              <p className="mt-1 text-sm text-muted-foreground">
                Revisa, organiza y abre tus notificaciones
                recibidas.
              </p>
            </div>

            {unreadCount > 0 ? (
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={markAllRead}
              >
                <CheckCheck className="mr-2 h-4 w-4" />
                Marcar todas como leidas
              </Button>
            ) : null}
          </div>
        </div>

        {notifications.length === 0 ? (
          <EmptyInbox />
        ) : (
          <div className="divide-y divide-border">
            {notifications.map((notification) => (
              <InboxRow
                key={notification.id}
                notification={notification}
                expanded={expandedId === notification.id}
                onOpen={openNotification}
                onMarkRead={markRead}
                onMarkUnread={markUnread}
                onDelete={deleteNotification}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function InboxRow({
  notification,
  expanded,
  onOpen,
  onMarkRead,
  onMarkUnread,
  onDelete,
}: {
  notification: NotificationItem;
  expanded: boolean;
  onOpen: (notification: NotificationItem) => void;
  onMarkRead: (notification: NotificationItem) => void;
  onMarkUnread: (notification: NotificationItem) => void;
  onDelete: (notification: NotificationItem) => void;
}) {
  const isUnread = notification.readAt === null;

  return (
    <article
      className={cn(
        "group transition-colors",
        expanded
          ? "bg-brand-soft/40"
          : isUnread
            ? "bg-white"
            : "bg-panel/70",
      )}
    >
      <div className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-3 px-5 py-4 transition hover:bg-surface/70 lg:px-8">
        <span
          className={cn(
            "mt-1.5 h-2.5 w-2.5 rounded-full",
            isUnread
              ? "bg-brand"
              : "bg-muted-foreground/25",
          )}
        />

        <button
          type="button"
          onClick={() => onOpen(notification)}
          className="min-w-0 text-left"
        >
          <span className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "truncate text-sm",
                isUnread
                  ? "font-semibold text-foreground"
                  : "font-medium text-foreground/80",
              )}
            >
              {notification.title}
            </span>

            <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
              {formatNotificationType(notification.type)}
            </span>
          </span>

          {notification.body ? (
            <span className="mt-1 block truncate text-sm text-muted-foreground">
              {notification.body}
            </span>
          ) : null}
        </button>

        <span className="flex flex-col items-end gap-2">
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {formatRelativeTime(notification.createdAt)}
          </span>

          <span className="flex items-center gap-3 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
            <IconAction
              label={
                isUnread
                  ? "Marcar como leida"
                  : "Marcar como no leida"
              }
              onClick={() => {
                if (isUnread) {
                  onMarkRead(notification);
                } else {
                  onMarkUnread(notification);
                }
              }}
            >
              {isUnread ? (
                <MailOpen className="h-4 w-4" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
            </IconAction>

            <IconAction
              label="Borrar"
              danger
              onClick={() => onDelete(notification)}
            >
              <Trash2 className="h-4 w-4" />
            </IconAction>
          </span>
        </span>
      </div>

      {expanded ? (
        <div className="border-t border-border bg-background px-8 py-5">
          <NotificationBody
            notification={notification}
            onMarkRead={onMarkRead}
            onMarkUnread={onMarkUnread}
            onDelete={onDelete}
          />
        </div>
      ) : null}
    </article>
  );
}

function NotificationBody({
  notification,
  onMarkRead,
  onMarkUnread,
  onDelete,
}: {
  notification: NotificationItem;
  onMarkRead: (notification: NotificationItem) => void;
  onMarkUnread: (notification: NotificationItem) => void;
  onDelete: (notification: NotificationItem) => void;
}) {
  const isUnread = notification.readAt === null;

  return (
    <div className="space-y-5">
      <div className="min-w-0">
        <p className="mb-2 inline-flex rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
          {formatNotificationType(notification.type)}
        </p>

        <h2 className="text-lg font-semibold leading-6 text-foreground">
          {notification.title}
        </h2>

        <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Clock3 className="h-3.5 w-3.5" />
          {formatFullDate(notification.createdAt)}
        </p>
      </div>

      <div className="rounded-lg border border-border bg-white p-4 text-sm leading-7 text-foreground">
        {notification.body ? (
          <p className="whitespace-pre-line">
            {notification.body}
          </p>
        ) : (
          <p className="text-muted-foreground">
            Esta notificacion no incluye detalle adicional.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {notification.href ? (
          <Button asChild>
            <Link href={notification.href}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Abrir destino
            </Link>
          </Button>
        ) : null}

        <Button
          type="button"
          variant="outline"
          onClick={() =>
            isUnread
              ? onMarkRead(notification)
              : onMarkUnread(notification)
          }
        >
          {isUnread ? (
            <MailOpen className="mr-2 h-4 w-4" />
          ) : (
            <Mail className="mr-2 h-4 w-4" />
          )}
          {isUnread
            ? "Marcar como leida"
            : "Marcar como no leida"}
        </Button>

        <Button
          type="button"
          variant="destructive"
          onClick={() => onDelete(notification)}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Borrar
        </Button>
      </div>
    </div>
  );
}

function EmptyInbox() {
  return (
    <div className="flex min-h-[460px] flex-col items-center justify-center px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-surface text-muted-foreground">
        <Inbox className="h-6 w-6" />
      </div>

      <h2 className="mt-5 text-base font-semibold text-foreground">
        La bandeja esta vacia
      </h2>

      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        Cuando recibas avisos, invitaciones o actualizaciones,
        apareceran aqui como historial completo.
      </p>
    </div>
  );
}

function IconAction({
  label,
  danger = false,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: MouseEventHandler<HTMLButtonElement>;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "text-muted-foreground transition hover:text-foreground",
        danger && "hover:text-destructive",
      )}
    >
      {children}
    </button>
  );
}

function formatNotificationType(type: string) {
  return type.replace(/_/g, " ");
}

function formatFullDate(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function buildNotificationSnapshot(
  notifications: NotificationItem[],
  unreadCount: number,
) {
  return `${unreadCount}:${notifications
    .map(
      (notification) =>
        `${notification.id}:${notification.readAt ?? "unread"}`,
    )
    .join("|")}`;
}
