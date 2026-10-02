// lib/services/course.service.ts

import OpenAI from "openai";
import { put } from "@vercel/blob";

import {
  createCourse,
  getCourseCreatorScope,
  getCourses,
} from "@/lib/repositories/course.repository";

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

// lib/services/course.service.ts

const blob = await put(
  `academy/course-covers/${crypto.randomUUID()}.png`,
  buffer,
  {
    access: "private",
    contentType: "image/png",
    addRandomSuffix: false,
  },
);

  return blob.url;
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