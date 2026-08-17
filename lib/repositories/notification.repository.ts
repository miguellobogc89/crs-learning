import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type CreateNotificationRecordInput = {
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  href?: string | null;
  metadata?: Prisma.InputJsonValue;
};

export function createNotificationRecord(
  data: CreateNotificationRecordInput,
) {
  return prisma.notifications.create({
    data: {
      user_id: data.userId,
      type: data.type,
      title: data.title,
      body: data.body ?? null,
      entity_type: data.entityType ?? null,
      entity_id: data.entityId ?? null,
      href: data.href ?? null,
      metadata: data.metadata ?? {},
    },
  });
}

export function getNotificationsByUserId(
  userId: string,
  options: {
    take?: number;
  } = {},
) {
  return prisma.notifications.findMany({
    where: {
      user_id: userId,
    },
    orderBy: {
      created_at: "desc",
    },
    take: options.take,
  });
}

export function countUnreadNotificationsByUserId(
  userId: string,
) {
  return prisma.notifications.count({
    where: {
      user_id: userId,
      read_at: null,
    },
  });
}

export function markNotificationReadByUserId(
  notificationId: string,
  userId: string,
) {
  return prisma.notifications.updateMany({
    where: {
      id: notificationId,
      user_id: userId,
      read_at: null,
    },
    data: {
      read_at: new Date(),
    },
  });
}

export function markAllNotificationsReadByUserId(
  userId: string,
) {
  return prisma.notifications.updateMany({
    where: {
      user_id: userId,
      read_at: null,
    },
    data: {
      read_at: new Date(),
    },
  });
}

export function markNotificationUnreadByUserId(
  notificationId: string,
  userId: string,
) {
  return prisma.notifications.updateMany({
    where: {
      id: notificationId,
      user_id: userId,
      read_at: {
        not: null,
      },
    },
    data: {
      read_at: null,
    },
  });
}

export function deleteNotificationByUserId(
  notificationId: string,
  userId: string,
) {
  return prisma.notifications.deleteMany({
    where: {
      id: notificationId,
      user_id: userId,
    },
  });
}
