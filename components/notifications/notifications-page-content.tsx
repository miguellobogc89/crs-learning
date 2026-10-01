// components/notifications/notifications-page-content.tsx

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
  }, [expandedId, router]);

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

  function markRead(
    notification: NotificationItem,
  ) {
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

  function markUnread(
    notification: NotificationItem,
  ) {
    if (notification.readAt === null) {
      return;
    }

    updateReadState(
      notification.id,
      null,
    );

    setUnreadCount(
      (current) => current + 1,
    );

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
    const wasUnread =
      notification.readAt === null;

    setNotifications((current) =>
      current.filter(
        (item) =>
          item.id !== notification.id,
      ),
    );

    setUnreadCount((current) =>
      wasUnread
        ? Math.max(0, current - 1)
        : current,
    );

    if (
      expandedId === notification.id
    ) {
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

    const now =
      new Date().toISOString();

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
    <main className="h-full min-h-0 bg-transparent px-6 pb-6 lg:px-8">
      <section
        className="
          mx-auto flex h-full min-h-0 max-w-7xl flex-col
          overflow-hidden rounded-2xl border border-slate-200
          bg-white
          shadow-[0_1px_2px_rgba(15,23,42,0.025)]
        "
      >
        {/* Cabecera */}
        <div className="shrink-0 px-6 py-5 lg:px-8">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Historial
              </p>

              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                Bandeja
              </h1>

              <p className="mt-1 text-sm text-muted-foreground">
                Revisa, organiza y abre tus
                notificaciones recibidas.
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
                Marcar todas como leídas
              </Button>
            ) : null}
          </div>
        </div>

        {/* Listado */}
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-slate-100">
          {notifications.length === 0 ? (
            <EmptyInbox />
          ) : (
            <div className="divide-y divide-slate-100">
              {notifications.map(
                (notification) => (
                  <InboxRow
                    key={notification.id}
                    notification={
                      notification
                    }
                    expanded={
                      expandedId ===
                      notification.id
                    }
                    onOpen={
                      openNotification
                    }
                    onMarkRead={
                      markRead
                    }
                    onMarkUnread={
                      markUnread
                    }
                    onDelete={
                      deleteNotification
                    }
                  />
                ),
              )}
            </div>
          )}
        </div>
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
  onOpen: (
    notification: NotificationItem,
  ) => void;
  onMarkRead: (
    notification: NotificationItem,
  ) => void;
  onMarkUnread: (
    notification: NotificationItem,
  ) => void;
  onDelete: (
    notification: NotificationItem,
  ) => void;
}) {
  const isUnread =
    notification.readAt === null;

  return (
    <article
      className={cn(
        "group transition-colors",
        expanded
          ? "bg-blue-50/40"
          : isUnread
            ? "bg-white"
            : "bg-slate-50/40",
      )}
    >
      <div className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-3 px-6 py-4 transition-colors hover:bg-slate-50/80 lg:px-8">
        {/* Indicador */}
        <span
          className={cn(
            "mt-1.5 h-2.5 w-2.5 rounded-full",
            isUnread
              ? "bg-blue-600"
              : "bg-slate-300",
          )}
        />

        {/* Contenido principal */}
        <button
          type="button"
          onClick={() =>
            onOpen(notification)
          }
          className="min-w-0 text-left"
        >
          <span className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "truncate text-sm",
                isUnread
                  ? "font-semibold text-slate-950"
                  : "font-medium text-slate-700",
              )}
            >
              {notification.title}
            </span>

            <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium uppercase text-slate-500">
              {formatNotificationType(
                notification.type,
              )}
            </span>
          </span>

          {notification.body ? (
            <span className="mt-1 block truncate text-sm text-slate-500">
              {notification.body}
            </span>
          ) : null}
        </button>

        {/* Fecha y acciones */}
        <span className="flex flex-col items-end gap-2">
          <span className="whitespace-nowrap text-xs text-slate-400">
            {formatRelativeTime(
              notification.createdAt,
            )}
          </span>

          <span className="flex items-center gap-3 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
            <IconAction
              label={
                isUnread
                  ? "Marcar como leída"
                  : "Marcar como no leída"
              }
              onClick={() => {
                if (isUnread) {
                  onMarkRead(
                    notification,
                  );
                } else {
                  onMarkUnread(
                    notification,
                  );
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
              onClick={() =>
                onDelete(
                  notification,
                )
              }
            >
              <Trash2 className="h-4 w-4" />
            </IconAction>
          </span>
        </span>
      </div>

      {/* Notificación abierta */}
      {expanded ? (
        <div className="border-t border-slate-100 bg-white px-8 py-5">
          <NotificationBody
            notification={
              notification
            }
            onMarkRead={
              onMarkRead
            }
            onMarkUnread={
              onMarkUnread
            }
            onDelete={
              onDelete
            }
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
  onMarkRead: (
    notification: NotificationItem,
  ) => void;
  onMarkUnread: (
    notification: NotificationItem,
  ) => void;
  onDelete: (
    notification: NotificationItem,
  ) => void;
}) {
  const isUnread =
    notification.readAt === null;

  return (
    <div className="space-y-5">
      <div className="min-w-0">
        <p className="mb-2 inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium uppercase text-slate-500">
          {formatNotificationType(
            notification.type,
          )}
        </p>

        <h2 className="text-lg font-semibold leading-6 text-slate-950">
          {notification.title}
        </h2>

        <p className="mt-2 flex items-center gap-2 text-xs text-slate-500">
          <Clock3 className="h-3.5 w-3.5" />

          {formatFullDate(
            notification.createdAt,
          )}
        </p>
      </div>

      <div className="text-sm leading-7 text-slate-700">
        {notification.body ? (
          <p className="whitespace-pre-line">
            {notification.body}
          </p>
        ) : (
          <p className="text-slate-500">
            Esta notificación no incluye
            detalle adicional.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {notification.href ? (
          <Button asChild>
            <Link
              href={
                notification.href
              }
            >
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
              ? onMarkRead(
                  notification,
                )
              : onMarkUnread(
                  notification,
                )
          }
        >
          {isUnread ? (
            <MailOpen className="mr-2 h-4 w-4" />
          ) : (
            <Mail className="mr-2 h-4 w-4" />
          )}

          {isUnread
            ? "Marcar como leída"
            : "Marcar como no leída"}
        </Button>

        <Button
          type="button"
          variant="destructive"
          onClick={() =>
            onDelete(notification)
          }
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
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-50 text-slate-500">
        <Inbox className="h-6 w-6" />
      </div>

      <h2 className="mt-5 text-base font-semibold text-slate-950">
        La bandeja está vacía
      </h2>

      <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
        La bandeja reúne invitaciones, avisos y
        actualizaciones importantes de tus espacios.
        Cuando haya algo que revisar, aparecerá aquí.
      </p>

      <Button
        asChild
        variant="brand"
        className="mt-6"
      >
        <Link href="/dashboard">
          Volver al dashboard
        </Link>
      </Button>
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
        "text-slate-400 transition-colors hover:text-slate-900",
        danger &&
          "hover:text-red-600",
      )}
    >
      {children}
    </button>
  );
}

function formatNotificationType(
  type: string,
) {
  return type.replace(/_/g, " ");
}

function formatFullDate(
  value: string,
) {
  return new Intl.DateTimeFormat(
    "es-ES",
    {
      dateStyle: "medium",
      timeStyle: "short",
    },
  ).format(new Date(value));
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