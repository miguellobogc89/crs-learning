import type { Prisma } from "@prisma/client";

import {
  countUnreadNotificationsByUserId,
  createNotificationRecord,
  deleteNotificationByUserId,
  getNotificationsByUserId,
  markAllNotificationsReadByUserId,
  markNotificationReadByUserId,
  markNotificationUnreadByUserId,
} from "@/lib/repositories/notification.repository";

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

export type CreateNotificationInput = {
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  href?: string | null;
  metadata?: Prisma.InputJsonValue;
};

type NotificationRecord = Awaited<
  ReturnType<typeof createNotificationRecord>
>;

function toNotificationItem(
  notification: NotificationRecord,
): NotificationItem {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    entityType: notification.entity_type,
    entityId: notification.entity_id,
    href: notification.href,
    readAt:
      notification.read_at?.toISOString() ?? null,
    createdAt: notification.created_at.toISOString(),
  };
}

export async function createNotification(
  input: CreateNotificationInput,
) {
  const notification =
    await createNotificationRecord(input);

  return toNotificationItem(notification);
}

export async function listUserNotifications(
  userId: string,
  options: {
    take?: number;
  } = {},
) {
  const notifications =
    await getNotificationsByUserId(
      userId,
      options,
    );

  return notifications.map(toNotificationItem);
}

export function getUnreadNotificationCount(
  userId: string,
) {
  return countUnreadNotificationsByUserId(userId);
}

export async function getUserNotificationSummary(
  userId: string,
  options: {
    take?: number;
  } = {},
) {
  const [notifications, unreadCount] =
    await Promise.all([
      listUserNotifications(userId, options),
      getUnreadNotificationCount(userId),
    ]);

  return {
    notifications,
    unreadCount,
  };
}

export function markUserNotificationAsRead(
  userId: string,
  notificationId: string,
) {
  return markNotificationReadByUserId(
    notificationId,
    userId,
  );
}

export function markAllUserNotificationsAsRead(
  userId: string,
) {
  return markAllNotificationsReadByUserId(userId);
}

export function markUserNotificationAsUnread(
  userId: string,
  notificationId: string,
) {
  return markNotificationUnreadByUserId(
    notificationId,
    userId,
  );
}

export function deleteUserNotification(
  userId: string,
  notificationId: string,
) {
  return deleteNotificationByUserId(
    notificationId,
    userId,
  );
}

export function createDevelopmentTestNotification(
  userId: string,
) {
  return createNotification({
    userId,
    type: "development_test",
    title: "Notificacion de prueba",
    body: "Esta notificacion permite validar la campana, el historial y la navegacion.",
    href: "/dashboard",
    metadata: {
      source: "development",
    },
  });
}
