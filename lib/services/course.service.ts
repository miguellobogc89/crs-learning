// lib/services/course.service.ts

import OpenAI from "openai";
import {
  issueSignedToken,
  presignUrl,
  put,
} from "@vercel/blob";
import type { Prisma } from "@prisma/client";

import {
  assignCourseToUsers,
  createCourse,
  deleteManagedCourse,
  getCompanyTeams,
  getCompanyUsers,
  getCourseAssignedUserIds,
  getCourseAssignmentCount,
  getCourseCreatorScope,
  getCourses,
  getManagedCourse,
  updateManagedCourse,
} from "@/lib/repositories/course.repository";
import type {
  AcademyAdminCourse,
  AcademyCourseAssignmentOption,
} from "@/lib/services/academy.service";

type TrainingType = "required" | "skills";
type CourseLevel = "beginner" | "intermediate" | "advanced";
type Difficulty = "low" | "medium" | "high";

const COURSE_MANAGER_ROLES = new Set([
  "org_manager",
  "system_admin",
]);

export async function listCourses() {
  return getCourses();
}

export async function newCourse(data: {
  userId: string;
  title: string;
  objective: string;
  trainingType: TrainingType;
  level: CourseLevel;
  difficulty: Difficulty;
  thumbnailUrl?: string | null;
}) {
  const user = await requireCourseManager(data.userId);

  return createCourse({
    title: data.title,
    description: data.objective,
    level: data.level,
    category:
      data.trainingType === "required"
        ? "Formación obligatoria"
        : "Desarrollo de competencias",
    companyId: user.company_id,
    createdByUserId: user.id,
    thumbnailUrl: data.thumbnailUrl ?? null,
    evaluationConfig: {
      generator: {
        trainingType: data.trainingType,
        difficulty: data.difficulty,
        level: data.level,
        strategy: "ai_generated",
      },
    },
  });
}

export async function updateCourse(data: {
  userId: string;
  courseId: string;
  title: string;
  description: string;
  trainingType: TrainingType;
  level: CourseLevel;
  difficulty: Difficulty;
  thumbnailUrl?: string | null;
}): Promise<AcademyAdminCourse> {
  const user = await requireCourseManager(data.userId);
  const current = await requireManagedCourse(
    data.courseId,
    user.company_id,
    user.system_role,
  );

  const currentConfig = asJsonObject(current.evaluation_config);

  const evaluationConfig = {
    ...currentConfig,
    generator: {
      ...asJsonObject(currentConfig.generator),
      trainingType: data.trainingType,
      difficulty: data.difficulty,
      level: data.level,
      strategy: "ai_generated",
    },
  } satisfies Prisma.InputJsonObject;

  const updated = await updateManagedCourse(data.courseId, {
    title: data.title,
    description: data.description || null,
    level: data.level,
    category:
      data.trainingType === "required"
        ? "Formación obligatoria"
        : "Desarrollo de competencias",
    evaluation_config: evaluationConfig,
    ...(data.thumbnailUrl
      ? { thumbnail_url: data.thumbnailUrl }
      : {}),
    updated_at: new Date(),
  });

  return mapManagedCourse(updated);
}

export async function setCoursePublished(data: {
  userId: string;
  courseId: string;
  published: boolean;
}): Promise<AcademyAdminCourse> {
  const user = await requireCourseManager(data.userId);

  await requireManagedCourse(
    data.courseId,
    user.company_id,
    user.system_role,
  );

  const updated = await updateManagedCourse(data.courseId, {
    is_published: data.published,
    updated_at: new Date(),
  });

  return mapManagedCourse(updated);
}

export async function deleteCourse(data: {
  userId: string;
  courseId: string;
}) {
  const user = await requireCourseManager(data.userId);

  await requireManagedCourse(
    data.courseId,
    user.company_id,
    user.system_role,
  );

  await deleteManagedCourse(data.courseId);
}

export async function getCourseManagementData(data: {
  userId: string;
  courseId: string;
}): Promise<AcademyCourseAssignmentOption[]> {
  const user = await requireCourseManager(data.userId);

  const course = await requireManagedCourse(
    data.courseId,
    user.company_id,
    user.system_role,
  );

  if (!course.company_id) {
    return [];
  }

  const [users, teams, assignedUserIds] = await Promise.all([
    getCompanyUsers(course.company_id),
    getCompanyTeams(course.company_id),
    getCourseAssignedUserIds(course.id),
  ]);

  const userOptions: AcademyCourseAssignmentOption[] = users.map(
    (member) => ({
      id: member.id,
      kind: "user",
      name: member.name || member.email,
      secondary: member.email,
      assigned: assignedUserIds.has(member.id),
    }),
  );

  const teamOptions: AcademyCourseAssignmentOption[] = teams.map(
    (team) => {
      const memberIds = team.knowledge_team_members.map(
        (member) => member.user_id,
      );

      return {
        id: team.id,
        kind: "team",
        name: team.name,
        secondary: `${memberIds.length} ${
          memberIds.length === 1 ? "miembro" : "miembros"
        }`,
        assigned:
          memberIds.length > 0 &&
          memberIds.every((id) => assignedUserIds.has(id)),
      };
    },
  );

  return [...userOptions, ...teamOptions];
}

export async function assignCourse(data: {
  userId: string;
  courseId: string;
  targetId: string;
  targetType: "user" | "team";
}): Promise<AcademyAdminCourse> {
  const user = await requireCourseManager(data.userId);

  const course = await requireManagedCourse(
    data.courseId,
    user.company_id,
    user.system_role,
  );

  if (!course.company_id) {
    throw new Error(
      "Este curso no pertenece a una organización.",
    );
  }

  let userIds: string[] = [];

  if (data.targetType === "user") {
    const companyUsers = await getCompanyUsers(course.company_id);
    const target = companyUsers.find(
      (member) => member.id === data.targetId,
    );

    if (!target) {
      throw new Error(
        "El usuario no pertenece a esta organización.",
      );
    }

    userIds = [target.id];
  } else {
    const teams = await getCompanyTeams(course.company_id);
    const team = teams.find((item) => item.id === data.targetId);

    if (!team) {
      throw new Error(
        "El equipo no pertenece a esta organización.",
      );
    }

    userIds = team.knowledge_team_members.map(
      (member) => member.user_id,
    );
  }

  await assignCourseToUsers({
    courseId: course.id,
    userIds,
    assignedByUserId: user.id,
    isRequired: getTrainingType(course) === "required",
  });

  const refreshed = await getManagedCourse(course.id);

  if (!refreshed) {
    throw new Error("Curso no encontrado.");
  }

  return mapManagedCourse(refreshed);
}

export async function generateCourseCover(data: {
  userId: string;
  title: string;
  objective: string;
  trainingType: TrainingType;
  level: CourseLevel;
  difficulty: Difficulty;
}) {
  await requireCourseManager(data.userId);

  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "Falta OPENAI_API_KEY para generar la portada.",
    );
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error(
      "Falta BLOB_READ_WRITE_TOKEN para guardar la portada.",
    );
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const trainingLabel =
    data.trainingType === "required"
      ? "mandatory corporate training"
      : "professional skills development";

  const prompt = [
    "Create a clean premium corporate e-learning course cover.",
    "Modern European enterprise software aesthetic.",
    "Professional photography or sophisticated editorial illustration.",
    "No text, no logos, no letters, no UI, no watermarks.",
    "Use a restrained palette with electric blue accents.",
    "The image must work as a horizontal course thumbnail.",
    `Course: ${data.title}.`,
    data.objective
      ? `Learning objective: ${data.objective}.`
      : "",
    `Training context: ${trainingLabel}.`,
    `Course level: ${data.level}.`,
    `Assessment difficulty: ${data.difficulty}.`,
  ]
    .filter(Boolean)
    .join(" ");

  const result = await openai.images.generate({
    model: "gpt-image-1.5",
    prompt,
    size: "1536x1024",
    quality: "medium",
  });

  const image = result.data?.[0];

  if (!image?.b64_json) {
    throw new Error(
      "El generador no ha devuelto una imagen válida.",
    );
  }

  const buffer = Buffer.from(image.b64_json, "base64");

  const pathname =
    `academy/course-covers/${crypto.randomUUID()}.png`;

  const blob = await put(pathname, buffer, {
    access: "private",
    contentType: "image/png",
    addRandomSuffix: false,
  });

  const token = await issueSignedToken({
    pathname,
    operations: ["get"],
    validUntil: Date.now() + 15 * 60 * 1000,
  });

  const { presignedUrl } = await presignUrl(token, {
    pathname,
    operation: "get",
    access: "private",
    validUntil: Date.now() + 15 * 60 * 1000,
  });

  return {
    blobUrl: blob.url,
    previewUrl: presignedUrl,
  };
}

async function requireCourseManager(userId: string) {
  const user = await getCourseCreatorScope(userId);

  if (!user) {
    throw new Error("Usuario no encontrado.");
  }

  if (!COURSE_MANAGER_ROLES.has(user.system_role)) {
    throw new Error(
      "No tienes permisos para gestionar cursos.",
    );
  }

  if (!user.company_id && user.system_role !== "system_admin") {
    throw new Error(
      "Tu usuario no está asociado a una organización.",
    );
  }

  return user;
}

async function requireManagedCourse(
  courseId: string,
  companyId: string | null,
  role: string,
) {
  const course = await getManagedCourse(courseId);

  if (!course) {
    throw new Error("Curso no encontrado.");
  }

  if (
    role !== "system_admin" &&
    course.company_id !== companyId
  ) {
    throw new Error(
      "No tienes permisos para gestionar este curso.",
    );
  }

  return course;
}

function mapManagedCourse(
  course: Awaited<ReturnType<typeof getManagedCourse>> extends infer T
    ? NonNullable<T>
    : never,
): AcademyAdminCourse {
  const type = getTrainingType(course);
  const config = asJsonObject(course.evaluation_config);
  const generator = asJsonObject(config.generator);

  const difficulty: Difficulty =
    generator.difficulty === "low" ||
    generator.difficulty === "high"
      ? generator.difficulty
      : "medium";

  const level: CourseLevel =
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
    status: course.is_published ? "published" : "draft",
    updatedAt: new Intl.DateTimeFormat("es-ES", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(course.updated_at),
    students: course._count.course_assignments,
    thumbnailUrl: course.thumbnail_url
      ? `/api/academy/course-cover/${course.id}?v=${course.updated_at.getTime()}`
      : null,
  };
}

function getTrainingType(course: {
  category: string | null;
  evaluation_config: Prisma.JsonValue | null;
}): TrainingType {
  const config = asJsonObject(course.evaluation_config);
  const generator = asJsonObject(config.generator);

  if (generator.trainingType === "required") {
    return "required";
  }

  return course.category === "Formación obligatoria"
    ? "required"
    : "skills";
}

function asJsonObject(
  value: unknown,
): Record<string, any> {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value as Record<string, any>;
  }

  return {};
}