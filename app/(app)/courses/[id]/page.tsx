// app/(app)/courses/[id]/page.tsx
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";

import { CourseTree } from "@/components/course-editor/course-tree";
import { CourseEditorTopbar } from "@/components/course-editor/course-editor-topbar";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function CoursePage({ params }: Props) {
  const { id } = await params;

  const course = await prisma.courses.findUnique({
    where: { id },
    include: {
      sections: {
        orderBy: { sort_order: "asc" },
        include: {
          section_items: {
            orderBy: { sort_order: "asc" },
            include: {
              lessons: true,
              quizzes: true,
            },
          },
        },
      },
    },
  });

  if (!course) {
    notFound();
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <CourseEditorTopbar courseTitle={course.title} />

      <CourseTree
        courseId={course.id}
        sections={course.sections}
      />
    </div>
  );
}