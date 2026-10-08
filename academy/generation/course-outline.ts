// lib/academy/generation/course-outline.ts
import OpenAI from "openai";

export type CourseOutlineInput = {
  title: string;
  objective: string;
  trainingType: "required" | "skills";
  level: "beginner" | "intermediate" | "advanced";
  difficulty: "low" | "medium" | "high";
};

export type CourseOutline = CourseOutlineInput & {
  version: 1;
  status: "pending_review";
  generatedAt: string;
  modules: Array<{
    order: number;
    title: string;
    description: string;
    learningObjectives: string[];
    estimatedMinutes: number;
  }>;
};

export async function generateCourseOutline(input: CourseOutlineInput): Promise<CourseOutline> {
  if (!process.env.OPENAI_API_KEY) throw new Error("Falta OPENAI_API_KEY.");
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.4,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "Eres un diseñador instruccional para formación corporativa.",
          "Devuelve SOLO un objeto JSON con la clave modules, con entre 3 y 8 módulos.",
          "Cada módulo tiene title, description, learningObjectives (2 a 4 strings) y estimatedMinutes (entero 15-180).",
          "Genera únicamente un esquema de módulos, nunca contenido de lecciones.",
          "Responde en español. No afirmes haber consultado documentación corporativa o Internet.",
        ].join(" "),
      },
      { role: "user", content: JSON.stringify(input) },
    ],
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.choices[0]?.message?.content ?? "");
  } catch {
    throw new Error("La IA devolvió una respuesta que no es JSON válido.");
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.modules) || parsed.modules.length < 3 || parsed.modules.length > 8) {
    throw new Error("La IA no devolvió entre 3 y 8 módulos válidos.");
  }

  const modules = parsed.modules.map((item, index) => {
    if (!isRecord(item) || !isNonempty(item.title) || !isNonempty(item.description) ||
        !Array.isArray(item.learningObjectives) || item.learningObjectives.length < 2 ||
        item.learningObjectives.length > 4 || !item.learningObjectives.every(isNonempty) ||
        typeof item.estimatedMinutes !== "number" || !Number.isInteger(item.estimatedMinutes) ||
        item.estimatedMinutes < 15 || item.estimatedMinutes > 180) {
      throw new Error(`El módulo ${index + 1} tiene datos incompletos.`);
    }
    return {
      order: index + 1,
      title: item.title.trim(),
      description: item.description.trim(),
      learningObjectives: item.learningObjectives.map((value: string) => value.trim()),
      estimatedMinutes: item.estimatedMinutes,
    };
  });

  return { ...input, version: 1, status: "pending_review", generatedAt: new Date().toISOString(), modules };
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
