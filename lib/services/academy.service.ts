import {
  getAcademyUserScope,
  getCompanyCourseRequests,
  getPublishedCoursesForUserCompany,
  getUserCourseAssignments,
  getUserCourseProgress,
  getUserVotedCourseRequestIds,
  type AcademyAssignmentRecord,
  type AcademyCourseWithProgressRecord,
} from "@/lib/repositories/course.repository";

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
};

export type AcademyHomeAssignment = AcademyHomeCourse & {
  assignment: "Obligatorio" | "Asignado";
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
  availableCourses: AcademyHomeCourse[];
  continueLearning: AcademyHomeCourse[];
  pendingTraining: AcademyHomeAssignment[];
  progressSummary: AcademyHomeProgressSummary;
  teamRequests: AcademyHomeTeamRequest[];
};

export async function getAcademyHomeData(
  userId: string,
): Promise<AcademyHomeData> {
  const userScope = await getAcademyUserScope(userId);

  if (!userScope) {
    throw new Error("Usuario no encontrado");
  }

  const companyId = userScope.company_id;

  const [
    availableCourseRecords,
    progressRecords,
    assignmentRecords,
    requestRecords,
  ] = await Promise.all([
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
      limit: 10,
    }),
    getCompanyCourseRequests({
      companyId,
      limit: 6,
    }),
  ]);

  const votedRequestIds = await getUserVotedCourseRequestIds({
    userId,
    requestIds: requestRecords.map((request) => request.id),
  });

  const availableCourses = availableCourseRecords.map(mapCourseRecord);
  const continueLearning = progressRecords
    .map(mapCourseRecord)
    .filter((course) => course.progress > 0 && course.progress < 100)
    .sort((left, right) => right.progress - left.progress)
    .slice(0, 3);
  const pendingTraining = assignmentRecords
    .map(mapAssignmentRecord)
    .filter((assignment) => assignment.progress < 100)
    .slice(0, 2);

  return {
    availableCourses,
    continueLearning,
    pendingTraining,
    progressSummary: buildProgressSummary({
      availableCourseRecords,
      progressRecords,
      assignmentRecords,
    }),
    teamRequests: requestRecords.slice(0, 3).map((request) => ({
      id: request.id,
      title: request.title,
      description: request.description,
      votes: request._count.course_request_votes,
      hasVoted: votedRequestIds.has(request.id),
    })),
  };
}

function mapCourseRecord(
  course: AcademyCourseWithProgressRecord,
): AcademyHomeCourse {
  const progress = clampProgress(
    course.user_course_progress[0]?.progress_percent ?? 0,
  );
  const estimatedMinutes = getCourseEstimatedMinutes(course);
  const remainingMinutes = Math.max(
    0,
    Math.round(estimatedMinutes * (1 - progress / 100)),
  );

  return {
    id: course.id,
    title: course.title,
    category: course.category || "Academy",
    duration: formatDuration(estimatedMinutes),
    remaining:
      remainingMinutes > 0
        ? `${formatDuration(remainingMinutes)} restantes`
        : "Completado",
    progress,
    thumbnail: inferThumbnailVariant(course),
    thumbnailUrl: course.thumbnail_url,
  };
}

function mapAssignmentRecord(
  assignment: AcademyAssignmentRecord,
): AcademyHomeAssignment {
  const course = mapCourseRecord(assignment.courses);

  return {
    ...course,
    assignment: assignment.is_required ? "Obligatorio" : "Asignado",
    isRequired: assignment.is_required,
    dueAt: assignment.due_at,
    deadlineLabel: formatDateLabel(assignment.due_at),
    dueLabel: formatDueLabel(assignment.due_at),
  };
}

function buildProgressSummary({
  availableCourseRecords,
  progressRecords,
  assignmentRecords,
}: {
  availableCourseRecords: AcademyCourseWithProgressRecord[];
  progressRecords: AcademyCourseWithProgressRecord[];
  assignmentRecords: AcademyAssignmentRecord[];
}): AcademyHomeProgressSummary {
  const progressByCourseId = new Map(
    progressRecords.map((course) => [
      course.id,
      clampProgress(
        course.user_course_progress[0]?.progress_percent ?? 0,
      ),
    ]),
  );

  for (const assignment of assignmentRecords) {
    if (!progressByCourseId.has(assignment.course_id)) {
      progressByCourseId.set(
        assignment.course_id,
        clampProgress(
          assignment.courses.user_course_progress[0]
            ?.progress_percent ?? 0,
        ),
      );
    }
  }

  const completed = Array.from(progressByCourseId.values()).filter(
    (progress) => progress >= 100,
  ).length;
  const inProgress = Array.from(progressByCourseId.values()).filter(
    (progress) => progress > 0 && progress < 100,
  ).length;
  const assignedPending = assignmentRecords.filter((assignment) => {
    const progress =
      progressByCourseId.get(assignment.course_id) ?? 0;

    return progress < 100;
  }).length;
  const knownCourseCount = Math.max(
    availableCourseRecords.length,
    progressByCourseId.size,
    assignmentRecords.length,
  );
  const global =
    knownCourseCount > 0
      ? Math.round(
          Array.from(progressByCourseId.values()).reduce(
            (total, progress) => total + progress,
            0,
          ) / knownCourseCount,
        )
      : 0;
  const estimatedCompletedMinutes = progressRecords.reduce(
    (total, course) =>
      total +
      Math.round(
        getCourseEstimatedMinutes(course) *
          (clampProgress(
            course.user_course_progress[0]?.progress_percent ?? 0,
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
    estimatedCompletedMinutes,
    estimatedCompletedLabel: formatDuration(estimatedCompletedMinutes),
  };
}

function getCourseEstimatedMinutes(
  course: Pick<AcademyCourseWithProgressRecord, "sections">,
) {
  const minutes = course.sections.reduce(
    (sectionTotal, section) =>
      sectionTotal +
      section.lessons.reduce(
        (lessonTotal, lesson) =>
          lessonTotal + lesson.estimated_minutes,
        0,
      ),
    0,
  );

  return minutes > 0 ? minutes : 30;
}

function clampProgress(value: number) {
  return Math.min(Math.max(Math.round(value), 0), 100);
}

function inferThumbnailVariant(
  course: Pick<
    AcademyCourseWithProgressRecord,
    "category" | "title"
  >,
): AcademyThumbnailVariant {
  const text = `${course.category ?? ""} ${course.title}`.toLowerCase();

  if (text.includes("seguridad") || text.includes("ciber")) {
    return "security";
  }

  if (text.includes("riesgo") || text.includes("cumpl")) {
    return "risk";
  }

  if (text.includes("ia") || text.includes("inteligencia")) {
    return "ai";
  }

  if (
    text.includes("power") ||
    text.includes("excel") ||
    text.includes("datos")
  ) {
    return "analytics";
  }

  if (text.includes("agil") || text.includes("proyecto")) {
    return "agile";
  }

  if (text.includes("comunic") || text.includes("equipo")) {
    return "team";
  }

  return "knowledge";
}

function formatDuration(minutes: number) {
  const safeMinutes = Math.max(Math.round(minutes), 0);

  if (safeMinutes < 60) {
    return `${safeMinutes} min`;
  }

  const hours = Math.floor(safeMinutes / 60);
  const rest = safeMinutes % 60;

  return rest > 0 ? `${hours} h ${rest} min` : `${hours} h`;
}

function formatDateLabel(date: Date | null) {
  if (!date) {
    return "Sin fecha limite";
  }

  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDueLabel(date: Date | null) {
  if (!date) {
    return "Sin fecha";
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dueDate = new Date(date);
  dueDate.setHours(0, 0, 0, 0);

  const diffDays = Math.ceil(
    (dueDate.getTime() - today.getTime()) /
      (1000 * 60 * 60 * 24),
  );

  if (diffDays < 0) {
    return `Vencio hace ${Math.abs(diffDays)} dias`;
  }

  if (diffDays === 0) {
    return "Vence hoy";
  }

  if (diffDays === 1) {
    return "Vence manana";
  }

  return `Quedan ${diffDays} dias`;
}
