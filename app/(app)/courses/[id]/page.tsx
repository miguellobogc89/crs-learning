// app/(app)/courses/[id]/page.tsx
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { recordResourceAccess } from "@/lib/services/resource-access.service";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";

import { CourseTree } from "@/components/course-editor/course-tree";
import { CourseEditorTopbar } from "@/components/course-editor/course-editor-topbar";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function CoursePage({ params }: Props) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  const { id } = await params;
  const { activeWorkspace } = await getActiveWorkspaceContext(
    session.user.id,
  );

  const course = await prisma.courses.findUnique({
    where: { id },
    include: {
      knowledge_sources: {
        select: {
          knowledge_libraries: {
            select: {
              workspace_id: true,
            },
          },
        },
      },
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

  if (
    course.knowledge_sources?.knowledge_libraries
      ?.workspace_id === activeWorkspace.id
  ) {
    await recordResourceAccess({
      userId: session.user.id,
      workspaceId: activeWorkspace.id,
      resourceType: "course",
      resourceId: course.id,
      interactionType: "viewed",
    });
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
