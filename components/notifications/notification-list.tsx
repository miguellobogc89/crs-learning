import Link from "next/link";
import {
  Bell,
  Circle,
  ExternalLink,
  Inbox,
} from "lucide-react";

import type { NotificationItem } from "@/lib/services/notification.service";
import { cn } from "@/lib/utils";

type NotificationListProps = {
  notifications: NotificationItem[];
  compact?: boolean;
  onNotificationClick?: (
    notification: NotificationItem,
  ) => void;
};

export function NotificationList({
  notifications,
  compact = false,
  onNotificationClick,
}: NotificationListProps) {
  if (notifications.length === 0) {
    const EmptyIcon = compact ? Bell : Inbox;

    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center text-center",
          compact ? "px-6 py-8" : "px-6 py-14",
        )}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <EmptyIcon className="h-4 w-4" />
        </div>

        <h2 className="mt-4 text-sm font-semibold text-foreground">
          {compact
            ? "No hay notificaciones recientes"
            : "La bandeja esta vacia"}
        </h2>

        <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">
          {compact
            ? "Cuando llegue algo nuevo aparecera aqui."
            : "Cuando recibas notificaciones, se guardaran en este historial."}
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "divide-y divide-border",
        compact ? "" : "rounded-xl border border-border bg-card",
      )}
    >
      {notifications.map((notification) => (
        <NotificationRow
          key={notification.id}
          notification={notification}
          compact={compact}
          onNotificationClick={onNotificationClick}
        />
      ))}
    </div>
  );
}

function NotificationRow({
  notification,
  compact,
  onNotificationClick,
}: {
  notification: NotificationItem;
  compact: boolean;
  onNotificationClick?: (
    notification: NotificationItem,
  ) => void;
}) {
  const isUnread = notification.readAt === null;
  const content = (
    <>
      <span
        className={cn(
          "mt-1.5 h-2 w-2 shrink-0 rounded-full",
          isUnread
            ? "bg-brand"
            : "bg-muted-foreground/25",
        )}
      />

      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-3">
          <span
            className={cn(
              "block text-sm leading-5",
              isUnread
                ? "font-semibold text-foreground"
                : "font-medium text-foreground/80",
            )}
          >
            {notification.title}
          </span>

          {notification.href ? (
            <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : null}
        </span>

        {notification.body ? (
          <span
            className={cn(
              "mt-1 block text-sm leading-5 text-muted-foreground",
              compact ? "line-clamp-2" : "",
            )}
          >
            {notification.body}
          </span>
        ) : null}

        <span className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          {formatRelativeTime(notification.createdAt)}

          {isUnread ? (
            <>
              <Circle className="h-1 w-1 fill-current" />
              Sin leer
            </>
          ) : null}
        </span>
      </span>
    </>
  );

  const className = cn(
    "flex w-full gap-3 text-left transition hover:bg-surface/70",
    compact ? "px-3 py-3" : "px-5 py-4",
    isUnread ? "bg-brand-soft/40" : "bg-card",
  );

  if (onNotificationClick) {
    return (
      <button
        type="button"
        className={className}
        onClick={() =>
          onNotificationClick(notification)
        }
      >
        {content}
      </button>
    );
  }

  if (notification.href) {
    return (
      <Link
        href={notification.href}
        className={className}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={className}
    >
      {content}
    </button>
  );
}

export function formatRelativeTime(value: string) {
  const date = new Date(value);
  const diffMs = date.getTime() - Date.now();
  const absMs = Math.abs(diffMs);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  const formatter = new Intl.RelativeTimeFormat(
    "es",
    {
      numeric: "auto",
    },
  );

  if (absMs < minute) {
    return "ahora";
  }

  if (absMs < hour) {
    return formatter.format(
      Math.round(diffMs / minute),
      "minute",
    );
  }

  if (absMs < day) {
    return formatter.format(
      Math.round(diffMs / hour),
      "hour",
    );
  }

  return formatter.format(
    Math.round(diffMs / day),
    "day",
  );
}
