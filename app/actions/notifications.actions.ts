"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import {
  createDevelopmentTestNotification,
  deleteUserNotification,
  getUserNotificationSummary,
  markAllUserNotificationsAsRead,
  markUserNotificationAsRead,
  markUserNotificationAsUnread,
} from "@/lib/services/notification.service";

function revalidateNotificationSurfaces() {
  revalidatePath("/", "layout");
  revalidatePath("/notifications");
}

export async function markNotificationReadAction(
  notificationId: string,
) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("No autenticado");
  }

  await markUserNotificationAsRead(
    session.user.id,
    notificationId,
  );

  revalidateNotificationSurfaces();
}

export async function getNotificationSummaryAction(
  options: {
    take?: number;
  } = {},
) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("No autenticado");
  }

  return getUserNotificationSummary(
    session.user.id,
    options,
  );
}

export async function markAllNotificationsReadAction() {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("No autenticado");
  }

  await markAllUserNotificationsAsRead(
    session.user.id,
  );

  revalidateNotificationSurfaces();
}

export async function markNotificationUnreadAction(
  notificationId: string,
) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("No autenticado");
  }

  await markUserNotificationAsUnread(
    session.user.id,
    notificationId,
  );

  revalidateNotificationSurfaces();
}

export async function deleteNotificationAction(
  notificationId: string,
) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("No autenticado");
  }

  await deleteUserNotification(
    session.user.id,
    notificationId,
  );

  revalidateNotificationSurfaces();
}

export async function createDevelopmentTestNotificationAction() {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("No disponible");
  }

  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("No autenticado");
  }

  await createDevelopmentTestNotification(
    session.user.id,
  );

  revalidateNotificationSurfaces();
}
