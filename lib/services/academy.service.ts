// lib/services/academy.service.ts

import { prisma } from "@/lib/prisma";
import { knowledgeSourceReadWhere } from "@/lib/knowledge/access-control";
import {
  getCourseCreatorScope,
  getAcademyHomePreviewCourses,
  getAcademyUserScope,
  getCompanyCourseRequests,
  getPublishedCoursesForUserCompany,
  getTopRecommendedCourse,
  getUserCourseAssignments,
  getUserCourseProgress,
  getUserVotedCourseRequestIds,
  type AcademyAssignmentRecord,
  type AcademyCourseWithProgressRecord,
} from "@/lib/repositories/course.repository";

export type AcademyAdminCourse = {
  id: string;
  title: string;
  description: string;
  type: "required" | "skills";
  level: "beginner" | "intermediate" | "advanced";
  difficulty: "low" | "medium" | "high";
  status: "published" | "draft";
  updatedAt: string;
  students: number;
  thumbnailUrl: string | null;
};

/** Read-only detail. Authorize before loading content or other users' assignments. */
export async function getAcademyCourseDetail(userId: string, courseId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(courseId)) return null;
  const user = await getCourseCreatorScope(userId);
  if (!user) return null;
  const scope = await prisma.courses.findUnique({
    where: { id: courseId },
    select: { company_id: true, is_published: true },
  });
  if (!scope) return null;
  const canManage = user.system_role === "system_admin" ||
    (user.system_role === "org_manager" && Boolean(user.company_id) && user.company_id === scope.company_id);
  if (!canManage && (scope.company_id !== null && scope.company_id !== user.company_id)) return null;
  if (!canManage && !scope.is_published) return null;

  const identity = { id: true, name: true } as const;
  const relatedCourseWhere = user.system_role === "system_admin" ? {} : {
    AND: [
      { OR: [{ company_id: user.company_id }, { company_id: null }] },
      { OR: [{ is_published: true }, ...(user.system_role === "org_manager" && user.company_id ? [{ company_id: user.company_id }] : [])] },
    ],
  };
  const quizInclude = {
    questions: {
      orderBy: { sort_order: "asc" as const },
      select: {
        id: true, quiz_id: true, question_text: true, question_type: true,
        explanation: canManage, sort_order: true, created_at: true,
        question_options: {
          orderBy: { sort_order: "asc" as const },
          select: { id: true, question_id: true, option_text: true, sort_order: true, is_correct: canManage },
        },
      },
    },
    quiz_attempts: { where: { user_id: userId }, orderBy: { started_at: "desc" as const } },
  };
  const course = await prisma.courses.findUnique({
    where: { id: courseId, company_id: scope.company_id, is_published: scope.is_published },
    include: {
      users: { select: identity },
      companies: { select: { id: true, name: true, slug: true } },
      course_assignments: {
        where: canManage ? {} : { user_id: userId },
        orderBy: { assigned_at: "desc" },
        include: {
          users_course_assignments_user_idTousers: { select: identity },
          users_course_assignments_assigned_by_user_idTousers: { select: identity },
        },
      },
      user_course_progress: { where: { user_id: userId } },
      sections: {
        orderBy: { sort_order: "asc" },
        include: {
          section_items: { orderBy: { sort_order: "asc" } },
          lessons: {
            orderBy: { sort_order: "asc" },
            include: {
              user_lesson_progress: { where: { user_id: userId } },
              quizzes: { orderBy: { created_at: "asc" }, include: quizInclude },
            },
          },
          quizzes: { where: { lesson_id: null }, orderBy: { created_at: "asc" }, include: quizInclude },
        },
      },
    },
  });
  if (!course) return null;
  const [requiredCourse, dependentCourses, source] = await Promise.all([
    course.required_course_id ? prisma.courses.findFirst({
      where: { id: course.required_course_id, ...relatedCourseWhere },
      select: { id: true, title: true, is_published: true },
    }) : null,
    prisma.courses.findMany({
      where: { required_course_id: courseId, ...relatedCourseWhere },
      select: { id: true, title: true, is_published: true },
      orderBy: { sort_order: "asc" },
    }),
    course.knowledge_source_id ? prisma.knowledge_sources.findFirst({
      where: { id: course.knowledge_source_id, ...knowledgeSourceReadWhere(userId) },
      include: { knowledge_files: { select: {
        id: true, file_name: true, file_type: true, file_size: true, status: true, created_at: true, updated_at: true,
      } } },
    }) : null,
  ]);
  return {
    course, canManage, requiredCourse, dependentCourses, source,
    estimatedMinutes: course.sections.reduce((total, section) =>
      total + section.lessons.reduce((minutes, lesson) => minutes + lesson.estimated_minutes, 0), 0),
  };
}

export type AcademyCourseDetail = NonNullable<Awaited<ReturnType<typeof getAcademyCourseDetail>>>;

export type AcademyCourseAssignmentOption = {
  id: string;
  kind: "user" | "team";
  name: string;
  secondary: string;
  assigned: boolean;
};

export async function getAcademyAdminCourses(
  userId: string,
): Promise<AcademyAdminCourse[]> {
  const user = await prisma.users.findUnique({
    where: {
      id: userId,
    },
    select: {
      company_id: true,
      system_role: true,
    },
  });

  if (!user) {
    return [];
  }

  const canManage =
    user.system_role === "org_manager" ||
    user.system_role === "system_admin";

  if (!canManage) {
    return [];
  }

  const courses = await prisma.courses.findMany({
    where:
      user.system_role === "system_admin" && !user.company_id
        ? {}
        : {
            company_id: user.company_id,
          },
    orderBy: {
      updated_at: "desc",
    },
    select: {
      id: true,
      title: true,
      description: true,
      level: true,
      category: true,
      thumbnail_url: true,
      evaluation_config: true,
      is_published: true,
      updated_at: true,
      _count: {
        select: {
          course_assignments: true,
        },
      },
    },
  });

  return courses.map((course) => {
    const config =
      course.evaluation_config &&
      typeof course.evaluation_config === "object" &&
      !Array.isArray(course.evaluation_config)
        ? course.evaluation_config
        : null;

    const generator =
      config &&
      "generator" in config &&
      config.generator &&
      typeof config.generator === "object" &&
      !Array.isArray(config.generator)
        ? config.generator
        : null;

    const difficulty =
      generator &&
      "difficulty" in generator &&
      (generator.difficulty === "low" ||
        generator.difficulty === "medium" ||
        generator.difficulty === "high")
        ? generator.difficulty
        : "medium";

    const type =
      generator &&
      "trainingType" in generator &&
      generator.trainingType === "required"
        ? "required"
        : course.category === "Formación obligatoria"
          ? "required"
          : "skills";

    const level =
      course.level === "intermediate" ||
      course.level === "advanced"
        ? course.level
        : "beginner";

    return {
      id: course.id,
      title: course.title,
      description: course.description ?? "",
      type,
      level,
      difficulty,
      status: course.is_published
        ? "published"
        : "draft",
      updatedAt: new Intl.DateTimeFormat("es-ES", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(course.updated_at),
      students: course._count.course_assignments,
      thumbnailUrl: course.thumbnail_url
        ? `/api/academy/course-cover/${course.id}`
        : null,
    };
  });
}

export type AcademyThumbnailVariant =
  | "analytics"
  | "team"
  | "security"
  | "risk"
  | "ai"
  | "agile"
  | "knowledge";

export type AcademyHomeCourse = {
  id: string;
  title: string;
  category: string;
  duration: string;
  remaining: string;
  progress: number;
  thumbnail: AcademyThumbnailVariant;
  thumbnailUrl: string | null;
  description: string | null;
level: string;
};

export type AcademyHomeAssignment =
  AcademyHomeCourse & {
    assignment:
      | "Obligatorio"
      | "Asignado";
    isRequired: boolean;
    dueAt: Date | null;
    deadlineLabel: string;
    dueLabel: string;
  };

export type AcademyHomeProgressSummary = {
  global: number;
  completed: number;
  inProgress: number;
  pending: number;
  skills: number;
  badges: number;
  estimatedCompletedMinutes: number;
  estimatedCompletedLabel: string;
};

export type AcademyHomeTeamRequest = {
  id: string;
  title: string;
  description: string | null;
  votes: number;
  hasVoted: boolean;
};

export type AcademyHomeData = {
  previewCourses: AcademyHomeCourse[];
  availableCourses: AcademyHomeCourse[];
  continueLearning: AcademyHomeCourse[];
  pendingTraining: AcademyHomeAssignment[];
  topRecommended: AcademyHomeCourse | null;
  progressSummary: AcademyHomeProgressSummary;
  teamRequests: AcademyHomeTeamRequest[];
  recommendedCourses: AcademyHomeCourse[];
};

export async function getAcademyHomeData(
  userId: string,
): Promise<AcademyHomeData> {
  const userScope =
    await getAcademyUserScope(userId);

  if (!userScope) {
    throw new Error(
      "Usuario no encontrado",
    );
  }

  const companyId =
    userScope.company_id;

  const [
    previewCourseRecords,
    availableCourseRecords,
    progressRecords,
    assignmentRecords,
    requestRecords,
    topRecommendedRecord,
    ] = await Promise.all([
        getAcademyHomePreviewCourses(
          userId,
          companyId,
        ),
        getPublishedCoursesForUserCompany({
          userId,
          companyId,
          limit: 24,
        }),
        getUserCourseProgress({
          userId,
          companyId,
        }),
        getUserCourseAssignments({
          userId,
          companyId,
        }),
        getCompanyCourseRequests({
          companyId,
          limit: 6,
        }),
        getTopRecommendedCourse({
          userId,
          companyId,
        })
    ]);

  const votedRequestIds =
    await getUserVotedCourseRequestIds({
      userId,
      requestIds:
        requestRecords.map(
          (request) => request.id,
        ),
    });

  const previewCourses =
    previewCourseRecords.map(
      mapCourseRecord,
    );

  const availableCourses =
    availableCourseRecords.map(
      mapCourseRecord,
    );

  const continueLearning = (() => {
    const selected = new Map<
      string,
      AcademyHomeCourse
    >();

    progressRecords
      .filter((course) => {
        const progress = clampProgress(
          course.user_course_progress[0]
            ?.progress_percent ?? 0,
        );

        return (
          progress > 0 &&
          progress < 100
        );
      })
      .sort((left, right) => {
        const leftUpdatedAt =
          left.user_course_progress[0]
            ?.updated_at?.getTime() ?? 0;

        const rightUpdatedAt =
          right.user_course_progress[0]
            ?.updated_at?.getTime() ?? 0;

        return (
          rightUpdatedAt -
          leftUpdatedAt
        );
      })
      .forEach((course) => {
        if (!selected.has(course.id)) {
          selected.set(
            course.id,
            mapCourseRecord(course),
          );
        }
      });

    assignmentRecords
      .filter((assignment) => {
        const progress = clampProgress(
          assignment.courses
            .user_course_progress[0]
            ?.progress_percent ?? 0,
        );

        return progress < 100;
      })
      .forEach((assignment) => {
        if (
          !selected.has(
            assignment.course_id,
          )
        ) {
          selected.set(
            assignment.course_id,
            mapCourseRecord(
              assignment.courses,
            ),
          );
        }
      });

    availableCourseRecords
      .filter((course) => {
        const progress = clampProgress(
          course.user_course_progress[0]
            ?.progress_percent ?? 0,
        );

        return progress < 100;
      })
      .forEach((course) => {
        if (!selected.has(course.id)) {
          selected.set(
            course.id,
            mapCourseRecord(course),
          );
        }
      });

    return Array.from(
      selected.values(),
    );
  })();

  /*
   * IMPORTANTE:
   *
   * Ya no hacemos slice(0, 2).
   *
   * AcademyHome recibe todos los cursos pendientes.
   * El componente decide cuáles dos enseñar en portada
   * y cuántos quedan detrás de "Ver todas".
   */
  const pendingTraining =
    assignmentRecords
      .map(mapAssignmentRecord)
      .filter(
        (assignment) =>
          assignment.progress < 100,
      )
      .sort(sortPendingTraining);

      const recommendedCourses = availableCourseRecords
  .filter((course) => {
    const progress =
      course.user_course_progress[0]?.progress_percent ?? 0;

    return progress < 100;
  })
  .slice(0, 4)
  .map(mapCourseRecord);

  return {
    previewCourses,
    availableCourses,
    continueLearning,
    pendingTraining,
    recommendedCourses,

    topRecommended:
    topRecommendedRecord
      ? mapCourseRecord(topRecommendedRecord)
      : null,

    progressSummary:
      buildProgressSummary({
        availableCourseRecords,
        progressRecords,
        assignmentRecords,
      }),

    teamRequests:
      requestRecords
        .slice(0, 3)
        .map((request) => ({
          id: request.id,
          title: request.title,
          description:
            request.description,
          votes:
            request._count
              .course_request_votes,
          hasVoted:
            votedRequestIds.has(
              request.id,
            ),
        })),
  };
}

function sortPendingTraining(
  left: AcademyHomeAssignment,
  right: AcademyHomeAssignment,
) {
  /*
   * 1. Obligatorios primero.
   * 2. Dentro del mismo tipo, fecha más próxima primero.
   * 3. Los que no tengan fecha quedan al final.
   */
  if (
    left.isRequired !==
    right.isRequired
  ) {
    return left.isRequired
      ? -1
      : 1;
  }

  if (
    left.dueAt &&
    right.dueAt
  ) {
    return (
      left.dueAt.getTime() -
      right.dueAt.getTime()
    );
  }

  if (left.dueAt) {
    return -1;
  }

  if (right.dueAt) {
    return 1;
  }

  return 0;
}

function mapCourseRecord(
  course: AcademyCourseWithProgressRecord,
): AcademyHomeCourse {
  const progress = clampProgress(
    course.user_course_progress[0]
      ?.progress_percent ?? 0,
  );

  const estimatedMinutes =
    getCourseEstimatedMinutes(course);

  const remainingMinutes =
    Math.max(
      0,
      Math.round(
        estimatedMinutes *
          (1 - progress / 100),
      ),
    );

  return {
    id: course.id,
    title: course.title,
    description: course.description,
    level: course.level,
    category:
      course.category ||
      "Academy",

    duration:
      formatDuration(
        estimatedMinutes,
      ),

    remaining:
      remainingMinutes > 0
        ? `${formatDuration(
            remainingMinutes,
          )} restantes`
        : "Completado",

    progress,

    thumbnail:
      inferThumbnailVariant(
        course,
      ),

    thumbnailUrl:
      course.thumbnail_url
        ? `/api/academy/course-cover/${course.id}`
        : null,
  };
}


function mapAssignmentRecord(
  assignment: AcademyAssignmentRecord,
): AcademyHomeAssignment {
  const course =
    mapCourseRecord(
      assignment.courses,
    );

  return {
    ...course,

    assignment:
      assignment.is_required
        ? "Obligatorio"
        : "Asignado",

    isRequired:
      assignment.is_required,

    dueAt:
      assignment.due_at,

    deadlineLabel:
      formatDateLabel(
        assignment.due_at,
      ),

    dueLabel:
      formatDueLabel(
        assignment.due_at,
      ),
  };
}

function buildProgressSummary({
  availableCourseRecords,
  progressRecords,
  assignmentRecords,
}: {
  availableCourseRecords:
    AcademyCourseWithProgressRecord[];

  progressRecords:
    AcademyCourseWithProgressRecord[];

  assignmentRecords:
    AcademyAssignmentRecord[];
}): AcademyHomeProgressSummary {
  const progressByCourseId =
    new Map(
      progressRecords.map(
        (course) => [
          course.id,
          clampProgress(
            course
              .user_course_progress[0]
              ?.progress_percent ?? 0,
          ),
        ],
      ),
    );

  for (
    const assignment of
    assignmentRecords
  ) {
    if (
      !progressByCourseId.has(
        assignment.course_id,
      )
    ) {
      progressByCourseId.set(
        assignment.course_id,
        clampProgress(
          assignment.courses
            .user_course_progress[0]
            ?.progress_percent ?? 0,
        ),
      );
    }
  }

  const completed =
    Array.from(
      progressByCourseId.values(),
    ).filter(
      (progress) =>
        progress >= 100,
    ).length;

  const inProgress =
    Array.from(
      progressByCourseId.values(),
    ).filter(
      (progress) =>
        progress > 0 &&
        progress < 100,
    ).length;

  const assignedPending =
    assignmentRecords.filter(
      (assignment) => {
        const progress =
          progressByCourseId.get(
            assignment.course_id,
          ) ?? 0;

        return progress < 100;
      },
    ).length;

  const knownCourseCount =
    Math.max(
      availableCourseRecords.length,
      progressByCourseId.size,
      assignmentRecords.length,
    );

  const global =
    knownCourseCount > 0
      ? Math.round(
          Array.from(
            progressByCourseId.values(),
          ).reduce(
            (
              total,
              progress,
            ) =>
              total +
              progress,
            0,
          ) /
            knownCourseCount,
        )
      : 0;

  const estimatedCompletedMinutes =
    progressRecords.reduce(
      (
        total,
        course,
      ) =>
        total +
        Math.round(
          getCourseEstimatedMinutes(
            course,
          ) *
            (clampProgress(
              course
                .user_course_progress[0]
                ?.progress_percent ??
                0,
            ) /
              100),
        ),
      0,
    );

return {
  global,
  completed,
  inProgress,
  pending: assignedPending,
  skills: 0,
  badges: 0,
  estimatedCompletedMinutes,
  estimatedCompletedLabel:
    formatDuration(
      estimatedCompletedMinutes,
    ),
};
}

function getCourseEstimatedMinutes(
  course: Pick<
    AcademyCourseWithProgressRecord,
    "sections"
  >,
) {
  const minutes =
    course.sections.reduce(
      (
        sectionTotal,
        section,
      ) =>
        sectionTotal +
        section.lessons.reduce(
          (
            lessonTotal,
            lesson,
          ) =>
            lessonTotal +
            lesson.estimated_minutes,
          0,
        ),
      0,
    );

  return minutes > 0
    ? minutes
    : 30;
}

function clampProgress(
  value: number,
) {
  return Math.min(
    Math.max(
      Math.round(value),
      0,
    ),
    100,
  );
}

function inferThumbnailVariant(
  course: Pick<
    AcademyCourseWithProgressRecord,
    "category" | "title"
  >,
): AcademyThumbnailVariant {
  const text =
    `${course.category ?? ""} ${course.title}`.toLowerCase();

  if (
    text.includes("seguridad") ||
    text.includes("ciber")
  ) {
    return "security";
  }

  if (
    text.includes("riesgo") ||
    text.includes("cumpl")
  ) {
    return "risk";
  }

  if (
    text.includes("ia") ||
    text.includes(
      "inteligencia",
    )
  ) {
    return "ai";
  }

  if (
    text.includes("power") ||
    text.includes("excel") ||
    text.includes("datos")
  ) {
    return "analytics";
  }

  if (
    text.includes("agil") ||
    text.includes("proyecto")
  ) {
    return "agile";
  }

  if (
    text.includes("comunic") ||
    text.includes("equipo")
  ) {
    return "team";
  }

  return "knowledge";
}

function formatDuration(
  minutes: number,
) {
  const safeMinutes =
    Math.max(
      Math.round(minutes),
      0,
    );

  if (safeMinutes < 60) {
    return `${safeMinutes} min`;
  }

  const hours =
    Math.floor(
      safeMinutes / 60,
    );

  const rest =
    safeMinutes % 60;

  return rest > 0
    ? `${hours} h ${rest} min`
    : `${hours} h`;
}

function formatDateLabel(
  date: Date | null,
) {
  if (!date) {
    return "Sin fecha límite";
  }

  return new Intl.DateTimeFormat(
    "es-ES",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
    },
  ).format(date);
}

function formatDueLabel(
  date: Date | null,
) {
  if (!date) {
    return "Sin fecha";
  }

  const today =
    new Date();

  today.setHours(
    0,
    0,
    0,
    0,
  );

  const dueDate =
    new Date(date);

  dueDate.setHours(
    0,
    0,
    0,
    0,
  );

  const diffDays =
    Math.ceil(
      (dueDate.getTime() -
        today.getTime()) /
        (1000 *
          60 *
          60 *
          24),
    );

  if (diffDays < 0) {
    return `Venció hace ${Math.abs(
      diffDays,
    )} días`;
  }

  if (diffDays === 0) {
    return "Vence hoy";
  }

  if (diffDays === 1) {
    return "Vence mañana";
  }

  return `Quedan ${diffDays} días`;
}
