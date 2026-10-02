// app/api/academy/course-cover/[courseId]/route.ts

import { get } from "@vercel/blob";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: {
    params: Promise<{
      courseId: string;
    }>;
  },
) {
  const session = await auth();

  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", {
      status: 401,
    });
  }

  const { courseId } = await context.params;

  const [user, course] = await Promise.all([
    prisma.users.findUnique({
      where: {
        id: session.user.id,
      },
      select: {
        company_id: true,
        system_role: true,
      },
    }),

    prisma.courses.findUnique({
      where: {
        id: courseId,
      },
      select: {
        company_id: true,
        thumbnail_url: true,
      },
    }),
  ]);

  if (!user || !course?.thumbnail_url) {
    return new NextResponse("Not found", {
      status: 404,
    });
  }

  const isSystemAdmin =
    user.system_role === "system_admin";

  const sameCompany =
    Boolean(user.company_id) &&
    user.company_id === course.company_id;

  const globalCourse =
    course.company_id === null;

  if (!isSystemAdmin && !sameCompany && !globalCourse) {
    return new NextResponse("Forbidden", {
      status: 403,
    });
  }

  try {
    /*
     * Vercel Blob privado se lee en servidor.
     * La URL privada nunca se expone al cliente.
     */
    const result = await get(course.thumbnail_url, {
      access: "private",
    });

    if (!result) {
      return new NextResponse("Not found", {
        status: 404,
      });
    }

    return new Response(result.stream, {
      status: 200,
      headers: {
        "Content-Type":
          result.blob.contentType ?? "image/png",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("course cover", error);

    return new NextResponse("Unable to load image", {
      status: 500,
    });
  }
}