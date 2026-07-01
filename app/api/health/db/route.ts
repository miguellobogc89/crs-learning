// app/api/health/db/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const usersCount = await prisma.users.count();

  return NextResponse.json({
    ok: true,
    database: "connected",
    usersCount,
  });
}