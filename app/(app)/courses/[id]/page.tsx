// app/(app)/courses/[id]/page.tsx
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";

import { PageTitle } from "@/components/app/page-title";
import { CourseTree } from "@/components/course-editor/course-tree";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function CoursePage({
  params,
}: Props) {
  const { id } = await params;

  const course = await prisma.courses.findUnique({
    where: {
      id,
    },
  include: {
  sections: {
    orderBy: {
      sort_order: "asc",
    },
    include: {
      section_items: {
        orderBy: {
          sort_order: "asc",
        },
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
    <>
      <PageTitle
        title={course.title}
        subtitle={course.description ?? ""}
      />

      <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-950 p-8">

        <h2 className="mb-6 text-2xl font-bold text-white">
          Estructura del curso
        </h2>

        <CourseTree
          courseId={course.id}
          sections={course.sections}
        />

      </div>
    </>
  );
}