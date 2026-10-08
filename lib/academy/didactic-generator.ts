
 // lib/academy/didactic-generator.ts

import OpenAI from "openai";

import {
  DIDACTIC_PHASES,
  validateDidacticPackage,
  validateDidacticScreen,
  type DidacticPackage,
  type DidacticPhase,
  type DidacticScreen,
  type DidacticScreenType,
} from "@/lib/academy/didactic-package";

type GenerateInput = {
  lessonId: string;
  lessonTitle: string;
  moduleTitle: string;
  courseTitle: string;
  courseDescription: string | null;
  content: string;
};

type ScreenPlan = {
  id: string;
  phase: DidacticPhase;
  type: DidacticScreenType;
  title: string;
  learningGoal: string;
  teachingStrategy: string;
  activityRequired: boolean;
};

type LessonPlan = {
  objective: string;
  pedagogicalApproach: string;
  keyConcepts: string[];
  screens: ScreenPlan[];
};

const MODEL = "gpt-4o";
const MIN_SCREENS = 5;
const MAX_SCREENS = 14;
const PLAN_ATTEMPTS = 3;
const SCREEN_ATTEMPTS = 3;
const CONCURRENCY = 3;

const TYPES: DidacticScreenType[] = [
  "concept",
  "comparison",
  "case",
  "process",
  "exercise",
  "summary",
  "decision",
  "simulation",
  "analysis",
  "demonstration",
];

function record(
  value: unknown,
): Record<string, unknown> | null {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  return value as Record<string, unknown>;
}

function stringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "string")
  );
}


function validatePlan(value: unknown): value is LessonPlan {
  const data = record(value);

  if (!data) {
    return false;
  }

  if (
    typeof data.objective !== "string" ||
    typeof data.pedagogicalApproach !== "string" ||
    !stringArray(data.keyConcepts) ||
    !Array.isArray(data.screens)
  ) {
    return false;
  }

  const screens: unknown[] = data.screens;

  if (
    screens.length < MIN_SCREENS ||
    screens.length > MAX_SCREENS
  ) {
    return false;
  }

  const ids = new Set<string>();
  let previousPhase = -1;
  let assessmentActivity = false;

  for (const raw of screens) {
    const screen = record(raw);

    if (
      !screen ||
      typeof screen.id !== "string" ||
      !screen.id.trim() ||
      ids.has(screen.id) ||
      !DIDACTIC_PHASES.includes(
        screen.phase as DidacticPhase,
      ) ||
      !TYPES.includes(screen.type as DidacticScreenType) ||
      typeof screen.title !== "string" ||
      typeof screen.learningGoal !== "string" ||
      typeof screen.teachingStrategy !== "string" ||
      typeof screen.activityRequired !== "boolean"
    ) {
      return false;
    }

    ids.add(screen.id);

    const phaseIndex = DIDACTIC_PHASES.indexOf(
      screen.phase as DidacticPhase,
    );

    if (phaseIndex < previousPhase) {
      return false;
    }

    previousPhase = phaseIndex;

    if (
      screen.phase === "assessment" &&
      screen.activityRequired
    ) {
      assessmentActivity = true;
    }
  }

  return (
    assessmentActivity &&
    DIDACTIC_PHASES.every((phase) =>
      screens.some((raw) => record(raw)?.phase === phase),
    )
  );
}



function diagnosePlan(value: unknown): string[] {
  const data = record(value);

  if (!data) {
    return ["El guion no es un objeto JSON."];
  }

  const issues: string[] = [];

  if (!Array.isArray(data.screens)) {
    issues.push("Falta el array screens.");
    return issues;
  }

  const screens: unknown[] = Array.isArray(data.screens)
  ? data.screens
  : [];

  if (
    screens.length < MIN_SCREENS ||
    screens.length > MAX_SCREENS
  ) {
    issues.push(
      `Hay ${screens.length} pantallas. ` +
      `Se admiten entre ${MIN_SCREENS} y ${MAX_SCREENS}.`,
    );
  }

  if (typeof data.objective !== "string") {
    issues.push("Falta objective.");
  }

  if (typeof data.pedagogicalApproach !== "string") {
    issues.push("Falta pedagogicalApproach.");
  }

  if (!stringArray(data.keyConcepts)) {
    issues.push("keyConcepts debe ser un array de strings.");
  }

  const ids = new Set<string>();
  let previousPhase = -1;

  screens.forEach((raw, index) => {
    const screen = record(raw);
    const label = `Pantalla ${index + 1}`;

    if (!screen) {
      issues.push(`${label}: objeto incorrecto.`);
      return;
    }

    if (
      typeof screen.id !== "string" ||
      !screen.id.trim() ||
      ids.has(screen.id)
    ) {
      issues.push(`${label}: ID ausente o duplicado.`);
    } else {
      ids.add(screen.id);
    }

    const phaseIndex = DIDACTIC_PHASES.indexOf(
      screen.phase as DidacticPhase,
    );

    if (phaseIndex === -1) {
      issues.push(`${label}: fase incorrecta.`);
    } else {
      if (phaseIndex < previousPhase) {
        issues.push(`${label}: fases desordenadas.`);
      }

      previousPhase = phaseIndex;
    }

    if (!TYPES.includes(screen.type as DidacticScreenType)) {
      issues.push(`${label}: tipo incorrecto.`);
    }

    if (typeof screen.title !== "string") {
      issues.push(`${label}: falta title.`);
    }

    if (typeof screen.learningGoal !== "string") {
      issues.push(`${label}: falta learningGoal.`);
    }

    if (typeof screen.teachingStrategy !== "string") {
      issues.push(`${label}: falta teachingStrategy.`);
    }

    if (typeof screen.activityRequired !== "boolean") {
      issues.push(`${label}: falta activityRequired.`);
    }
  });

  for (const phase of DIDACTIC_PHASES) {
    if (
      !screens.some(
        (raw) => record(raw)?.phase === phase,
      )
    ) {
      issues.push(`Falta la fase ${phase}.`);
    }
  }

  if (
    !screens.some((raw) => {
      const screen = record(raw);

      return (
        screen?.phase === "assessment" &&
        screen.activityRequired === true
      );
    })
  ) {
    issues.push(
      "Falta una actividad obligatoria en assessment.",
    );
  }

  return issues.length
    ? issues
    : ["El guion contiene campos no válidos."];
}


const PLAN_PROMPT = `
Eres un diseñador instruccional especializado
en formación empresarial y aprendizaje activo.

PRIMERA ETAPA: DISEÑA EL GUION PEDAGÓGICO.

No desarrolles todavía las explicaciones completas.
No escribas actividades completas ni contenido visual.

Diseña una secuencia de entre 5 y 9 pantallas
como punto de partida. Puedes usar hasta 14
si el contenido realmente lo requiere.

La cantidad debe depender de la complejidad,
no de una plantilla fija.

Incluye, en orden, las cuatro fases:
introduction, development, assessment, reflection.

Cada fase debe tener al menos una pantalla.
En assessment debe haber al menos una actividad.

El alumno debe aprender mediante una combinación
adecuada de explicación, demostración, aplicación,
decisiones y reflexión.

Evita empezar siempre con una definición.
Evita convertir todas las pantallas en tarjetas.

Elige estrategias apropiadas a la materia.
Una clase de negociación no debe parecerse
mecánicamente a una de lenguaje corporal.

Cuando proceda, integra marcos profesionales
o científicos conocidos, con sus limitaciones.
No inventes estudios, cifras ni referencias.

Tipos permitidos:
concept, comparison, case, process, exercise,
summary, decision, simulation, analysis,
demonstration.

Devuelve SOLO JSON con esta estructura:

{
  "objective": "Objetivo observable",
  "pedagogicalApproach": "Por qué esta secuencia enseña",
  "keyConcepts": ["Concepto 1"],
  "screens": [
    {
      "id": "intro-01",
      "phase": "introduction",
      "type": "case",
      "title": "Título",
      "learningGoal": "Aprendizaje específico",
      "teachingStrategy": "Estrategia pedagógica",
      "activityRequired": false
    }
  ]
}

No incluyas texto explicativo fuera del JSON.
`.trim();

const SCREEN_PROMPT = `
Eres un profesor experto y diseñador instruccional.

SEGUNDA ETAPA: DESARROLLA UNA ÚNICA PANTALLA
de un guion pedagógico previamente aprobado.

Debes respetar el ID, la fase, el tipo,
el título y el objetivo de esa pantalla.

No crees pantallas adicionales.
No modifiques el guion.

La explicación del profesor debe aportar
conocimiento sustantivo, razonamiento,
ejemplos y matices. No repitas las tarjetas.

Adapta el contenido a la materia.
Usa situaciones profesionales plausibles.
Distingue entre hechos, modelos y ejemplos.
No inventes estudios, fuentes o cifras.

En lenguaje corporal, evita afirmar que
un gesto aislado demuestra una emoción
o permite detectar mentiras.

VISUALES

Usa uno de estos layouts:
cards, steps, columns, statement,
scenario, timeline, diagram.

Elige el más apropiado.
visual.items debe tener entre 1 y 6 elementos.
Cada elemento tiene title y description.

Los layouts son instrucciones para el
reproductor, no imágenes generadas.

ACTIVIDADES

Si activityRequired es true,
activity debe ser un objeto completo.

Si activityRequired es false,
activity puede ser null, salvo que
una actividad breve aporte valor.

Tipos:
open_response, decision, case_analysis,
simulation, reflection.

Toda actividad contiene:
kind, instruction, scenario, expectedLearning,
assessmentCriteria, hints, minimumScore,
maxAttempts, options y debrief.

minimumScore: 70.
maxAttempts: 3.

Si kind es decision, incluye 2 a 4 opciones.
Cada opción debe tener:
id, label, consequence, feedback, isPreferred.

Debe existir una opción preferible.
Las alternativas deben ser plausibles.
Las consecuencias deben enseñar.

Si no es decision, utiliza options: [].

No supongas que la actividad ya está
evaluada por una IA. Diseña los criterios
para una futura evaluación.

Devuelve exclusivamente JSON:

{
  "subtitle": null,
  "visual": {
    "layout": "scenario",
    "items": [
      {
        "title": "Situación",
        "description": "Contenido concreto"
      }
    ]
  },
  "teacher": {
    "explanation": "Explicación completa",
    "transition": "Conexión con la siguiente pantalla"
  },
  "activity": null,
  "estimatedMinutes": 3
}

No devuelvas id, phase, type, title,
learningGoal ni teachingStrategy.
Los añade el servidor desde el guion.

No generes HTML, JSX ni Markdown estructural.
`.trim();

async function requestJson(
  client: OpenAI,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
): Promise<unknown> {
  const result = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.25,
    response_format: {
      type: "json_object",
    },
    messages,
  });

  const raw = result.choices[0]?.message?.content;

  if (!raw) {
    throw new Error("La IA ha devuelto una respuesta vacía.");
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error("La IA ha devuelto JSON incorrecto.");
  }
}

async function generatePlan(
  client: OpenAI,
  input: GenerateInput,
): Promise<LessonPlan> {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: PLAN_PROMPT,
    },
    {
      role: "user",
      content: JSON.stringify({
        course: input.courseTitle,
        courseDescription: input.courseDescription,
        module: input.moduleTitle,
        lesson: input.lessonTitle,
        content: input.content,
      }),
    },
  ];

  let lastIssues: string[] = [];

  for (let attempt = 1; attempt <= PLAN_ATTEMPTS; attempt++) {
    let candidate: unknown;

    try {
      candidate = await requestJson(client, messages);
    } catch (error) {
      lastIssues = [
        error instanceof Error
          ? error.message
          : "Error desconocido al generar el guion.",
      ];
      continue;
    }

    if (validatePlan(candidate)) {
      console.info(
        `[Academy] Guion válido: ${candidate.screens.length} pantallas.`,
      );
      return candidate;
    }

    lastIssues = diagnosePlan(candidate);

    console.warn(
      `[Academy] Guion ${attempt}/${PLAN_ATTEMPTS}:`,
      lastIssues,
    );

    messages.push({
      role: "assistant",
      content: JSON.stringify(candidate),
    });

    messages.push({
      role: "user",
      content: [
        "Corrige únicamente la estructura del guion.",
        "Conserva su contenido pedagógico.",
        "Errores:",
        ...lastIssues.map((issue) => `- ${issue}`),
        "Devuelve el JSON completo corregido.",
      ].join("\n"),
    });
  }

  throw new Error(
    "No se ha podido construir el guion didáctico. " +
    (lastIssues[0] ?? "Error desconocido."),
  );
}

function buildScreen(
  plan: ScreenPlan,
  generated: unknown,
): unknown {
  const data = record(generated);

  if (!data) return null;

  return {
    id: plan.id,
    phase: plan.phase,
    type: plan.type,
    title: plan.title,
    learningGoal: plan.learningGoal,
    teachingStrategy: plan.teachingStrategy,
    subtitle: data.subtitle,
    visual: data.visual,
    teacher: data.teacher,
    activity: data.activity,
    estimatedMinutes: data.estimatedMinutes,
  };
}

function diagnoseScreen(
  plan: ScreenPlan,
  value: unknown,
): string[] {
  const issues: string[] = [];
  const data = record(value);

  if (!data) {
    return ["La pantalla no es un objeto JSON."];
  }

  if (
    data.subtitle !== null &&
    typeof data.subtitle !== "string"
  ) {
    issues.push("subtitle debe ser string o null.");
  }

  const visual = record(data.visual);

  if (!visual) {
    issues.push("Falta visual.");
  } else {
    const layouts = [
      "cards",
      "steps",
      "columns",
      "statement",
      "scenario",
      "timeline",
      "diagram",
    ];

    if (!layouts.includes(String(visual.layout))) {
      issues.push("visual.layout no es válido.");
    }

    if (
      !Array.isArray(visual.items) ||
      visual.items.length < 1 ||
      visual.items.length > 6
    ) {
      issues.push("visual.items debe contener de 1 a 6 elementos.");
    } else {
      visual.items.forEach((item, index) => {
        const entry = record(item);

        if (
          !entry ||
          typeof entry.title !== "string" ||
          typeof entry.description !== "string"
        ) {
          issues.push(
            `visual.items[${index}] necesita title y description.`,
          );
        }
      });
    }
  }

  const teacher = record(data.teacher);

  if (
    !teacher ||
    typeof teacher.explanation !== "string" ||
    (
      teacher.transition !== null &&
      typeof teacher.transition !== "string"
    )
  ) {
    issues.push(
      "teacher necesita explanation y transition (string o null).",
    );
  }

  if (
    typeof data.estimatedMinutes !== "number" ||
    !Number.isFinite(data.estimatedMinutes) ||
    data.estimatedMinutes <= 0
  ) {
    issues.push("estimatedMinutes debe ser un número positivo.");
  }

  if (plan.activityRequired && !record(data.activity)) {
    issues.push("Esta pantalla requiere una actividad.");
  }

  if (data.activity !== null) {
    const activity = record(data.activity);

    if (!activity) {
      issues.push("activity debe ser objeto o null.");
    } else {
      if (
        typeof activity.instruction !== "string" ||
        typeof activity.expectedLearning !== "string" ||
        !stringArray(activity.assessmentCriteria) ||
        activity.assessmentCriteria.length === 0 ||
        !stringArray(activity.hints) ||
        activity.hints.length === 0 ||
        typeof activity.minimumScore !== "number" ||
        activity.minimumScore < 0 ||
        activity.minimumScore > 100 ||
        typeof activity.maxAttempts !== "number" ||
        !Number.isInteger(activity.maxAttempts) ||
        activity.maxAttempts < 1
      ) {
        issues.push("Faltan campos obligatorios de activity.");
      }

      if (activity.kind === "decision") {
        if (
          !Array.isArray(activity.options) ||
          activity.options.length < 2 ||
          activity.options.length > 4
        ) {
          issues.push(
            "Una decisión necesita entre 2 y 4 alternativas.",
          );
        } else if (
          !activity.options.some(
            (option) =>
              record(option) && option.isPreferred === true,
          )
        ) {
          issues.push(
            "La decisión necesita una alternativa preferible.",
          );
        }
      }
    }
  }

  return issues.length
    ? issues
    : ["La pantalla contiene un campo no válido."];
}

async function generateScreen(
  client: OpenAI,
  input: GenerateInput,
  lessonPlan: LessonPlan,
  screenPlan: ScreenPlan,
  index: number,
): Promise<DidacticScreen> {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: SCREEN_PROMPT,
    },
    {
      role: "user",
      content: JSON.stringify({
        course: input.courseTitle,
        lesson: input.lessonTitle,
        originalContent: input.content,
        lessonObjective: lessonPlan.objective,
        keyConcepts: lessonPlan.keyConcepts,
        completeOutline: lessonPlan.screens.map((screen) => ({
          id: screen.id,
          title: screen.title,
          learningGoal: screen.learningGoal,
        })),
        currentScreen: screenPlan,
        position: index + 1,
        totalScreens: lessonPlan.screens.length,
      }),
    },
  ];

  let lastIssues: string[] = [];

  for (
    let attempt = 1;
    attempt <= SCREEN_ATTEMPTS;
    attempt++
  ) {
    let generated: unknown;

    try {
      generated = await requestJson(client, messages);
    } catch (error) {
      lastIssues = [
        error instanceof Error
          ? error.message
          : "Error al desarrollar la pantalla.",
      ];
      continue;
    }

    const candidate = buildScreen(screenPlan, generated);

    if (
      validateDidacticScreen(candidate) &&
      (!screenPlan.activityRequired ||
        candidate.activity !== null)
    ) {
      return candidate;
    }

    lastIssues = diagnoseScreen(screenPlan, generated);

    console.warn(
      `[Academy] Pantalla ${screenPlan.id}, ` +
      `intento ${attempt}/${SCREEN_ATTEMPTS}:`,
      lastIssues,
    );

    messages.push({
      role: "assistant",
      content: JSON.stringify(generated),
    });

    messages.push({
      role: "user",
      content: [
        "Corrige exclusivamente esta pantalla.",
        "Mantén su contenido pedagógico.",
        "Problemas:",
        ...lastIssues.map((issue) => `- ${issue}`),
        "Devuelve el JSON corregido.",
      ].join("\n"),
    });
  }

  throw new Error(
    `No se ha podido desarrollar "${screenPlan.title}". ` +
    (lastIssues[0] ?? "Error de validación."),
  );
}

async function generateScreens(
  client: OpenAI,
  input: GenerateInput,
  plan: LessonPlan,
): Promise<DidacticScreen[]> {
  const results: DidacticScreen[] = [];

  // Se procesan grupos pequeños para limitar
  // las peticiones simultáneas al modelo.
  for (
    let start = 0;
    start < plan.screens.length;
    start += CONCURRENCY
  ) {
    const batch = plan.screens.slice(
      start,
      start + CONCURRENCY,
    );

    const generated = await Promise.all(
      batch.map((screen, offset) =>
        generateScreen(
          client,
          input,
          plan,
          screen,
          start + offset,
        ),
      ),
    );

    results.push(...generated);

    console.info(
      `[Academy] Desarrolladas ${results.length}/` +
      `${plan.screens.length} pantallas.`,
    );
  }

  return results;
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

  // Etapa 1: estructura pedagógica.
  const plan = await generatePlan(client, input);

  // Etapa 2: desarrollo de cada pantalla.
  const screens = await generateScreens(
    client,
    input,
    plan,
  );

  const didacticPackage: DidacticPackage = {
    version: 1,
    lessonId: input.lessonId,
    lessonTitle: input.lessonTitle,
    objective: plan.objective,
    pedagogicalApproach: plan.pedagogicalApproach,
    keyConcepts: plan.keyConcepts,
    prerequisites: [],
    screens,
    sources: [],
    generatedAt: new Date().toISOString(),
    status: "draft",
  };

  if (!validateDidacticPackage(didacticPackage)) {
    throw new Error(
      "Las pantallas se han generado, pero el paquete " +
      "final no supera la validación. " +
      "Revisa el orden de las fases y las actividades.",
    );
  }

  console.info(
    `[Academy] Clase generada correctamente: ` +
    `${screens.length} pantallas.`,
  );

  return didacticPackage;
}
