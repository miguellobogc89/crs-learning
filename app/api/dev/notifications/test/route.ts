import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { createDevelopmentTestNotification } from "@/lib/services/notification.service";

export async function POST() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { error: "Not found" },
      { status: 404 },
    );
  }

  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "No autenticado" },
      { status: 401 },
    );
  }

  const notification =
    await createDevelopmentTestNotification(
      session.user.id,
    );

  return NextResponse.json({ notification });
}
