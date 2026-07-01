// app/actions/course.ts
"use server";

import { redirect } from "next/navigation";
import { newCourse } from "@/lib/services/course.service";

export async function createCourseAction(formData: FormData) {
  const title = String(formData.get("title"));
  const description = String(formData.get("description"));
  const level = String(formData.get("level"));

  const course = await newCourse({
    title,
    description,
    level,
  });

  redirect(`/courses/${course.id}`);
}