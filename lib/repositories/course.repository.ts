// lib/repositories/course.repository.ts
import type { courses } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export async function getCourses(): Promise<courses[]> {
  return prisma.courses.findMany({
    orderBy: {
      created_at: "desc",
    },
  });
}

export async function createCourse(data: {
  title: string;
  description: string;
  level: string;
}) {
  return prisma.courses.create({
    data: {
      title: data.title,
      slug: crypto.randomUUID(),
      description: data.description,
      level: data.level,
      is_published: false,
    },
  });
}