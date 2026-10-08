
 // app/(app)/courses/[id]/learn/page.tsx

import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getAcademyCourseDetail } from "@/lib/services/academy.service";
import { AcademyLearningRoom } from "@/components/academy/learning-room/academy-learning-room";

export default async function AcademyLearnPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  const { id } = await params;

  const detail = await getAcademyCourseDetail(
    session.user.id,
    id,
  );

  if (!detail) {
    notFound();
  }

  const { course, canManage } = detail;

  if (!course.is_published && !canManage) {
    notFound();
  }

  const modules = course.sections.map((section) => ({
    id: section.id,
    title: section.title,
    lessons: section.lessons.map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      estimatedMinutes: lesson.estimated_minutes,
      completed: Boolean(
        lesson.user_lesson_progress[0]?.completed_at,
      ),
    })),
  }));

  if (!modules.some((module) => module.lessons.length > 0)) {
    notFound();
  }

  return (
    <AcademyLearningRoom
      courseId={course.id}
      courseTitle={course.title}
      modules={modules}
      preview={!course.is_published}
    />
  );
}
