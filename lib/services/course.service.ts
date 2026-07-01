// lib/services/course.service.ts
import {
  createCourse,
  getCourses,
} from "@/lib/repositories/course.repository";

export async function listCourses() {
  return getCourses();
}

export async function newCourse(data: {
  title: string;
  description: string;
  level: string;
}) {
  return createCourse(data);
}