
// lib/academy/didactic-generator.ts

import OpenAI from "openai";

import {
  validateDidacticPackage,
  type DidacticPackage,
} from "@/lib/academy/didactic-package";

type GenerateInput = {
  lessonId: string;
  lessonTitle: string;
  moduleTitle: string;
  courseTitle: string;
  courseDescription: string | null;
  content: string;
};

const SYSTEM_PROMPT = `
Eres un equipo experto en diseño instruccional,
didáctica, investigación y formación profesional.

Debes transformar una lección escrita en una clase
audiovisual interactiva dirigida por un profesor IA.

NO estás escribiendo una conversación.
Estás produciendo el GUION EJECUTABLE de una clase.

REGLAS:

1. Genera entre 6 y 14 pantallas didácticas.

2. Organízalas en este orden obligatorio:
   introduction
   development
   assessment
   reflection

3. Cada pantalla debe contener:
   - título
   - contenido visual estructurado
   - explicación del profesor
   - transición opcional
   - actividad opcional

4. La introducción debe despertar interés,
   explicar el objetivo y activar conocimientos previos.

5. El desarrollo debe enseñar los conceptos
   mediante ejemplos, comparaciones, casos,
   demostraciones y actividades.

6. La evaluación debe exigir aplicación real.
   Nunca debe aprobarse únicamente por contestar
   "sí", "vale", "todas" o "no sé".

7. El cierre debe incluir síntesis y reflexión
   sobre la aplicación profesional.

8. El profesor dirige la clase.
   No pide permiso continuamente para continuar.

9. Evita elogios automáticos y complacencia.
   La retroalimentación debe ser específica.

10. No adelantes contenidos pertenecientes a
    otras lecciones, salvo referencias necesarias.

11. Cuando corresponda, utiliza teorías,
    métodos, investigaciones o casos reales.

12. No inventes fuentes ni afirmes haberlas
    comprobado. Si propones referencias,
    verificationStatus debe ser "pending".

13. Si no puedes respaldar un caso real,
    utiliza un ejemplo hipotético y señálalo.

14. Las actividades deben tener criterios de
    evaluación observables, pistas y límites
    de intentos.

15. minimumScore es un entero de 0 a 100.
    Utiliza habitualmente 70.

16. maxAttempts suele estar entre 2 y 4.

17. El campo visual contiene una estructura
    renderizable, NO HTML ni código ejecutable.

18. Usa identificadores únicos para las pantallas.

19. Mantén rigor conceptual y lenguaje natural
    en español de España.

20. Devuelve exclusivamente JSON válido.

ESQUEMA:

{
  "objective": "Objetivo verificable",
  "screens": [
    {
      "id": "intro-01",
      "phase": "introduction",
      "type": "case",
      "title": "Título",
      "subtitle": null,
      "visual": {
        "layout": "cards",
        "items": [
          {
            "title": "Elemento",
            "description": "Descripción"
          }
        ]
      },
      "teacher": {
        "explanation": "Texto que pronuncia el profesor",
        "transition": "Conexión con la siguiente pantalla"
      },
      "activity": {
        "instruction": "Pregunta o tarea concreta",
        "expectedLearning": "Qué debe demostrar",
        "assessmentCriteria": [
          "Criterio observable"
        ],
        "hints": [
          "Pista progresiva"
        ],
        "minimumScore": 70,
        "maxAttempts": 3
      }
    }
  ],
  "sources": [
    {
      "title": "Referencia bibliográfica propuesta",
      "author": null,
      "url": null,
      "relevance": "Qué aporta a la lección",
      "verificationStatus": "pending"
    }
  ]
}

Usa activity: null cuando no corresponda.

No generes enlaces inventados.
No atribuyas citas textuales no verificadas.
`.trim();

export async function generateDidacticPackage(
  input: GenerateInput,
): Promise<DidacticPackage> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Falta configurar OPENAI_API_KEY.");
  }

  if (!input.content.trim()) {
    throw new Error("La lección no tiene contenido.");
  }

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const result = await client.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.3,
    response_format: {
      type: "json_object",
    },
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: JSON.stringify({
          course: input.courseTitle,
          courseDescription: input.courseDescription,
          module: input.moduleTitle,
          lesson: input.lessonTitle,
          originalContent: input.content,
        }),
      },
    ],
  });

  const raw = result.choices[0]?.message?.content;

  if (!raw) {
    throw new Error("La IA no ha generado el paquete didáctico.");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("El paquete generado no contiene JSON válido.");
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    throw new Error("Formato de generación incorrecto.");
  }

  const generated = parsed as Record<string, unknown>;

  const candidate: unknown = {
    version: 1,
    lessonId: input.lessonId,
    lessonTitle: input.lessonTitle,
    objective: generated.objective,
    screens: generated.screens,
    sources: generated.sources,
    generatedAt: new Date().toISOString(),
    status: "draft",
  };

  if (!validateDidacticPackage(candidate)) {
    throw new Error(
      "El guion generado no cumple la estructura pedagógica. " +
      "Es necesario regenerarlo.",
    );
  }

  return candidate;
}
