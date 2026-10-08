
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

const MAX_ATTEMPTS = 3;

const SYSTEM_PROMPT = `
Eres un diseñador instruccional experto en formación
profesional, pedagogía y aprendizaje activo.

Transforma el contenido de una lección en una clase
visual estructurada dirigida por un profesor IA.

Devuelve exclusivamente un objeto JSON.

REQUISITOS OBLIGATORIOS:

- Entre 6 y 14 pantallas.
- Cuatro fases, en este orden exacto:
  introduction, development, assessment, reflection.
- Cada fase debe tener al menos una pantalla.
- Cada pantalla tiene un ID único.
- El contenido debe enseñar, no limitarse a resumir.
- Incluye ejemplos, casos y actividades de aplicación.
- La fase assessment contiene al menos una actividad.
- Las actividades tienen criterios observables,
  pistas, minimumScore entre 0 y 100 y
  maxAttempts entero mayor o igual que 1.
- Usa habitualmente minimumScore: 70.
- No inventes investigaciones, fuentes ni citas.
- Toda fuente propuesta debe llevar
  verificationStatus: "pending".
- La explicación del profesor debe ser natural,
  rigurosa y adecuada para formación empresarial.
- No generes HTML, JSX ni Markdown estructural.

ESQUEMA JSON EXACTO:

{
  "objective": "Objetivo verificable",
  "screens": [
    {
      "id": "intro-01",
      "phase": "introduction",
      "type": "concept",
      "title": "Título",
      "subtitle": null,
      "visual": {
        "layout": "cards",
        "items": [
          {
            "title": "Concepto",
            "description": "Explicación visual"
          }
        ]
      },
      "teacher": {
        "explanation": "Explicación del profesor",
        "transition": null
      },
      "activity": null
    }
  ],
  "sources": []
}

VALORES PERMITIDOS:

phase:
introduction | development | assessment | reflection

type:
concept | comparison | case | process | exercise | summary

visual.layout:
cards | steps | columns | statement

REGLAS ESTRUCTURALES:

- visual.items contiene entre 1 y 6 elementos.
- Cada elemento tiene title y description.
- subtitle es string o null.
- teacher.explanation siempre es string.
- teacher.transition es string o null.
- activity debe existir siempre: objeto o null.
- Si activity es objeto, incluye:
  instruction: string
  expectedLearning: string
  assessmentCriteria: array de strings no vacío
  hints: array de strings no vacío
  minimumScore: número entre 0 y 100
  maxAttempts: entero mayor o igual que 1
- sources siempre es un array.
- Cada fuente tiene:
  title: string
  author: string o null
  url: string o null
  relevance: string
  verificationStatus: "pending"
- No añadas version, lessonId, lessonTitle,
  generatedAt ni status: los añade el servidor.

Comprueba todos los requisitos antes de responder.
`.trim();

function asRecord(
  value: unknown,
): Record<string, unknown> | null {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  return value as Record<string, unknown>;
}

function diagnose(value: unknown): string[] {
  const errors: string[] = [];
  const data = asRecord(value);

  if (!data) {
    return ["La respuesta no es un objeto JSON."];
  }

  if (typeof data.objective !== "string") {
    errors.push("objective debe ser un string.");
  }

  if (!Array.isArray(data.sources)) {
    errors.push("sources debe ser un array.");
  } else {
    data.sources.forEach((source, index) => {
      const item = asRecord(source);

      if (
        !item ||
        typeof item.title !== "string" ||
        typeof item.relevance !== "string" ||
        !(
          item.author === null ||
          typeof item.author === "string"
        ) ||
        !(
          item.url === null ||
          typeof item.url === "string"
        ) ||
        item.verificationStatus !== "pending"
      ) {
        errors.push(
          `Fuente ${index + 1}: estructura incorrecta.`,
        );
      }
    });
  }

  if (!Array.isArray(data.screens)) {
    errors.push("screens debe ser un array.");
    return errors;
  }

  const screens = data.screens;

  if (screens.length < 6 || screens.length > 14) {
    errors.push(
      `Se requieren entre 6 y 14 pantallas; hay ${screens.length}.`,
    );
  }

  const phases = [
    "introduction",
    "development",
    "assessment",
    "reflection",
  ];

  const types = [
    "concept",
    "comparison",
    "case",
    "process",
    "exercise",
    "summary",
  ];

  const layouts = [
    "cards",
    "steps",
    "columns",
    "statement",
  ];

  const ids = new Set<string>();
  let previousPhase = -1;
  let hasAssessment = false;

  screens.forEach((rawScreen, index) => {
    const screen = asRecord(rawScreen);
    const prefix = `Pantalla ${index + 1}`;

    if (!screen) {
      errors.push(`${prefix}: no es un objeto.`);
      return;
    }

    if (
      typeof screen.id !== "string" ||
      ids.has(screen.id)
    ) {
      errors.push(`${prefix}: ID ausente o duplicado.`);
    } else {
      ids.add(screen.id);
    }

    const phaseIndex = phases.indexOf(
      String(screen.phase),
    );

    if (phaseIndex < 0) {
      errors.push(`${prefix}: fase no válida.`);
    } else {
      if (phaseIndex < previousPhase) {
        errors.push(
          `${prefix}: las fases están desordenadas.`,
        );
      }
      previousPhase = phaseIndex;
    }

    if (!types.includes(String(screen.type))) {
      errors.push(`${prefix}: tipo no válido.`);
    }

    if (typeof screen.title !== "string") {
      errors.push(`${prefix}: falta title.`);
    }

    if (
      screen.subtitle !== null &&
      typeof screen.subtitle !== "string"
    ) {
      errors.push(`${prefix}: subtitle debe ser string o null.`);
    }

    const visual = asRecord(screen.visual);

    if (
      !visual ||
      !layouts.includes(String(visual.layout)) ||
      !Array.isArray(visual.items) ||
      visual.items.length < 1 ||
      visual.items.length > 6
    ) {
      errors.push(`${prefix}: visual incorrecto.`);
    } else {
      visual.items.forEach((rawItem, itemIndex) => {
        const item = asRecord(rawItem);

        if (
          !item ||
          typeof item.title !== "string" ||
          typeof item.description !== "string"
        ) {
          errors.push(
            `${prefix}: elemento visual ${itemIndex + 1} incorrecto.`,
          );
        }
      });
    }

    const teacher = asRecord(screen.teacher);

    if (
      !teacher ||
      typeof teacher.explanation !== "string" ||
      !(
        teacher.transition === null ||
        typeof teacher.transition === "string"
      )
    ) {
      errors.push(`${prefix}: teacher incorrecto.`);
    }

    if (screen.activity === null) {
      return;
    }

    const activity = asRecord(screen.activity);

    if (!activity) {
      errors.push(
        `${prefix}: activity debe ser null u objeto.`,
      );
      return;
    }

    if (
      typeof activity.instruction !== "string" ||
      typeof activity.expectedLearning !== "string" ||
      !Array.isArray(activity.assessmentCriteria) ||
      activity.assessmentCriteria.length < 1 ||
      !activity.assessmentCriteria.every(
        (item: unknown) => typeof item === "string",
      ) ||
      !Array.isArray(activity.hints) ||
      activity.hints.length < 1 ||
      !activity.hints.every(
        (item: unknown) => typeof item === "string",
      ) ||
      typeof activity.minimumScore !== "number" ||
      activity.minimumScore < 0 ||
      activity.minimumScore > 100 ||
      
typeof activity.maxAttempts !== "number" ||
!Number.isInteger(activity.maxAttempts) ||
activity.maxAttempts < 1

    ) {
      errors.push(`${prefix}: actividad incorrecta.`);
    } else if (screen.phase === "assessment") {
      hasAssessment = true;
    }
  });

  for (const phase of phases) {
    if (
      !screens.some(
        (screen) => asRecord(screen)?.phase === phase,
      )
    ) {
      errors.push(`Falta la fase ${phase}.`);
    }
  }

  if (!hasAssessment) {
    errors.push(
      "Falta una actividad válida en la fase assessment.",
    );
  }

  return errors;
}

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

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
    [
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
    ];

  for (
    let attempt = 1;
    attempt <= MAX_ATTEMPTS;
    attempt++
  ) {
    const result = await client.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.2,
      response_format: {
        type: "json_object",
      },
      messages,
    });

    const raw = result.choices[0]?.message?.content;

    if (!raw) {
      throw new Error(
        "La IA ha devuelto una respuesta vacía.",
      );
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }

    const generated = asRecord(parsed);

    const candidate: unknown = {
      version: 1,
      lessonId: input.lessonId,
      lessonTitle: input.lessonTitle,
      objective: generated?.objective,
      screens: generated?.screens,
      sources: generated?.sources,
      generatedAt: new Date().toISOString(),
      status: "draft",
    };

    if (validateDidacticPackage(candidate)) {
      return candidate;
    }

    const errors = diagnose(candidate);

    console.warn(
      `[Academy] Intento ${attempt}/${MAX_ATTEMPTS} inválido:`,
      errors,
    );

    if (attempt === MAX_ATTEMPTS) {
      throw new Error(
        "No se ha podido producir una clase válida tras " +
        `${MAX_ATTEMPTS} intentos. ` +
        `Primer problema detectado: ${
          errors[0] ?? "estructura no válida"
        }`,
      );
    }

    messages.push({
      role: "assistant",
      content: raw,
    });

    messages.push({
      role: "user",
      content: [
        "Tu respuesta anterior no supera la validación.",
        "Corrige el JSON completo manteniendo su calidad",
        "pedagógica y el contenido de la lección.",
        "Errores detectados:",
        ...errors.map((error) => `- ${error}`),
        "Devuelve exclusivamente el JSON corregido.",
      ].join("\n"),
    });
  }

  throw new Error("No se ha podido generar la clase.");
}
