
 // lib/academy/didactic-generator.ts

import OpenAI from "openai";

import {
  validateInteraction,
  type InteractionData,
  INTERACTION_KINDS,
} from "./interaction-schema";

import {
  DIDACTIC_PHASES,
  SCREEN_TYPES,
  validateDidacticPackage,
  validateDidacticScreen,
  type DidacticPackage,
  type DidacticScreen,
  type DidacticPhase,
  type DidacticScreenType,
  type DidacticActivity,
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
  interaction:
    | "none"
    | "quiz"
    | "sorting"
    | "decision"
    | InteractionData["kind"];
};

type LessonPlan = {
  objective: string;
  pedagogicalApproach: string;
  keyConcepts: string[];
  screens: ScreenPlan[];
};

const MODEL = "gpt-4o";

const record = (
  value: unknown
): Record<string, unknown> | null =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const strings = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.every((item) => typeof item === "string");

const string = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback;

const nonempty = (value: unknown, fallback: string) =>
  typeof value === "string" && value.trim()
    ? value
    : fallback;

const isNewInteraction = (
  kind: ScreenPlan["interaction"]
): kind is InteractionData["kind"] =>
  INTERACTION_KINDS.includes(
    kind as InteractionData["kind"]
  );

const isChoiceInteraction = (
  kind: ScreenPlan["interaction"]
) =>
  kind === "quiz" ||
  kind === "decision" ||
  kind === "quick-quiz" ||
  kind === "choose-your-path" ||
  kind === "flip-challenge";

const PLAN_PROMPT = `
Eres un diseñador instruccional experto en formación empresarial.

Tu misión es convertir el contenido de una lección en una
experiencia didáctica breve, clara, práctica e interactiva.

Devuelve exclusivamente un objeto JSON válido.

ESTRUCTURA:
{
  "objective": "...",
  "pedagogicalApproach": "...",
  "keyConcepts": ["..."],
  "screens": [
    {
      "id": "intro-01",
      "phase": "introduction",
      "type": "case",
      "title": "...",
      "learningGoal": "...",
      "teachingStrategy": "...",
      "activityRequired": false,
      "interaction": "none"
    }
  ]
}

REGLAS GENERALES:
- Diseña entre 8 y 12 pantallas; máximo 14.
- Fases obligatorias y en este orden:
  introduction, development, assessment, reflection.
- Todas las fases deben estar presentes.
- Incluye al menos una actividad en assessment.
- Incluye al menos dos interacciones.
- Alterna explicaciones visuales y ejercicios.
- No coloques ejercicios en todas las pantallas.
- Cada pantalla debe enseñar o practicar algo concreto.
- Evita repetir conceptos o formular preguntas equivalentes.
- Usa ejemplos realistas del entorno empresarial.
- Adapta la dificultad al contenido de la lección.
- No inventes normas, cifras, fuentes ni hechos.
- Evita ejercicios de redacción.

TIPOS DE PANTALLA:
${SCREEN_TYPES.join(", ")}

TIPOS DE INTERACCIÓN:
none
quiz
sorting
decision
flip-cards
flip-challenge
match-pairs
sort-it
put-in-order
quick-quiz
choose-your-path

Si interaction no es "none", activityRequired debe ser true.

DISEÑO DE LOS CUESTIONARIOS:
- Prioriza quick-quiz para preguntas de respuesta única.
- Mantén quiz y decision para compatibilidad.
- No hagas preguntas triviales de memorizar definiciones.
- Formula preguntas sobre situaciones y decisiones reales.
- Cada pregunta debe exigir aplicar un concepto.
- Evita que la respuesta correcta sea evidente por su longitud.
- Evita opciones absurdas o manifiestamente incorrectas.
- No uses siempre la segunda opción como correcta.
- Distribuye las respuestas correctas entre A, B, C y D.
- Los errores deben representar confusiones habituales.

OTRAS INTERACCIONES:
- flip-cards: descubrir conceptos.
- flip-challenge: comparar alternativas.
- match-pairs: relacionar elementos.
- sort-it: clasificar conceptos.
- put-in-order: ordenar procesos.
- choose-your-path: explorar consecuencias.

Elige la mecánica que mejor sirva al objetivo pedagógico.
No utilices interacciones distintas solo por variedad visual.

La secuencia debe ser específica al contenido recibido.
`;

const SCREEN_PROMPT = `
Eres un diseñador instruccional experto.

Desarrolla UNA pantalla del guion como JSON válido.
No devuelvas markdown ni texto fuera del JSON.

ESTRUCTURA GENERAL:
{
  "subtitle": null,
  "visual": {
    "layout": "explore",
    "items": [
      {
        "title": "...",
        "description": "..."
      }
    ]
  },
  "teacher": {
    "explanation": "...",
    "transition": null
  },
  "activity": null,
  "interactionData": null,
  "estimatedMinutes": 2
}

No devuelvas id, phase, type, title ni learningGoal.
El servidor añade esos campos.

CONTENIDO:
- Escribe en español natural, claro y profesional.
- Evita frases genéricas y explicaciones vacías.
- No repitas el título como contenido.
- Cada pantalla debe aportar aprendizaje real.
- Evita tecnicismos innecesarios.
- Usa ejemplos específicos del tema.
- No inventes hechos o referencias.

CONTENIDO VISUAL:
Layouts permitidos:
cards, steps, columns, statement, scenario,
timeline, diagram, explore.

- Entre 1 y 6 elementos.
- Preferiblemente entre 2 y 5.
- title: máximo aproximado de 50 caracteres.
- description: máximo aproximado de 190 caracteres.
- Evita párrafos extensos.
- Para pantallas interactivas, el visual es secundario.

PROFESOR:
- explanation: explicación útil y complementaria.
- Preferiblemente menos de 350 caracteres.
- transition: texto breve o null.
- No repitas literalmente las tarjetas.

REGLA FUNDAMENTAL:
Si la pantalla tiene una interacción nueva:
- activity debe ser null.
- interactionData debe contener el ejercicio.
- interactionData.kind debe coincidir exactamente
  con currentScreen.interaction.

Si interaction es quiz, sorting o decision:
- Usa activity.
- interactionData debe ser null.

Si interaction es none:
- activity debe ser null.
- interactionData debe ser null.

==================================================
CALIDAD PEDAGÓGICA DE LOS TEST
==================================================

Los test deben evaluar comprensión y aplicación,
NO simple reconocimiento de palabras.

CADA TEST DEBE CONTENER:

1. UN CASO COMPRENSIBLE
- Describe una situación empresarial concreta.
- Explica quién interviene.
- Explica qué necesita cada parte.
- Identifica el problema o la decisión.
- Proporciona suficiente información para responder.
- Entre 3 y 5 frases, aproximadamente.
- Evita contextos genéricos de una sola frase.

2. UNA PREGUNTA CLARA
- Pregunta qué decisión, actuación o interpretación
  resulta más adecuada.
- Debe poder responderse con la información del caso.
- No introduzcas información nueva en la pregunta.
- Evita preguntas ambiguas.

3. EXACTAMENTE CUATRO ALTERNATIVAS
- Una respuesta correcta.
- Tres distractores plausibles.
- Las cuatro deben responder a la misma pregunta.
- Todas deben tener longitud y detalle similares.
- Ninguna debe ser una opción absurda.
- No utilices "todas las anteriores" ni
  "ninguna de las anteriores".
- No hagas siempre correcta la opción B.
- Las alternativas incorrectas deben representar
  errores de razonamiento realistas.

4. FEEDBACK ESPECÍFICO
- Explica por qué cada respuesta es adecuada o no.
- Relaciona la explicación con el caso.
- No uses solamente "correcto" o "incorrecto".
- No inventes consecuencias inevitables.
- No reveles la respuesta correcta en la pregunta.

EJEMPLO DE CALIDAD:

Caso:
"El departamento de Operaciones necesita dos técnicos
adicionales para cumplir un plazo. Finanzas rechaza
la contratación porque el presupuesto anual está
prácticamente agotado. Ambos responsables tienen
objetivos legítimos, pero no consiguen ponerse de
acuerdo."

Pregunta:
"¿Qué debería hacer primero el responsable de
Operaciones para facilitar un acuerdo?"

Alternativas:
A. Reiterar su petición sin modificarla.
B. Explorar las restricciones y necesidades de ambos.
C. Renunciar inmediatamente a las contrataciones.
D. Escalar el desacuerdo sin discutir alternativas.

Correcta: B.

Las otras tres opciones son errores plausibles:
insistencia en posiciones, concesión prematura y
escalada innecesaria.

El ejemplo ilustra el nivel de claridad esperado.
NO reutilices ese caso si no corresponde a la lección.

==================================================
INTERACCIONES NUEVAS
==================================================

flip-cards:
- 2 a 6 items.
- Cada item: id, label, description.
- Contenido breve y útil.
- Sirve para explorar conceptos.

flip-challenge:
- Exactamente 4 options.
- Cada option: id, label, isPreferred, feedback,
  consequence.
- Exactamente una isPreferred=true.
- Las cuatro alternativas deben ser plausibles.

match-pairs:
- Entre 2 y 6 parejas.
- Cada pareja tiene un elemento izquierdo y derecho.
- Los izquierdos incluyen matchId apuntando al id
  del elemento derecho.
- Los derechos no incluyen matchId.
- Todos los ids son únicos.
- Relaciones claras y no ambiguas.

sort-it:
- Entre 2 y 4 groups.
- Entre 3 y 8 items.
- Cada group: id, label.
- Cada item: id, label, groupId, feedback.
- groupId debe existir en groups.
- Cada elemento debe pertenecer claramente
  a una sola categoría.
- Evita clasificaciones subjetivas.
- Explica brevemente los errores habituales.

put-in-order:
- Entre 3 y 7 items.
- Cada item: id, label.
- Los items deben estar EN ORDEN CORRECTO.
- El reproductor los mezclará.
- Utiliza procesos con una secuencia verificable.
- Evita pasos intercambiables.

quick-quiz:
- EXACTAMENTE 4 options.
- Cada option: id, label, isPreferred, feedback.
- EXACTAMENTE UNA isPreferred=true.
- Incluye el caso completo en instruction.
- Separa el caso y la pregunta mediante un salto
  de línea doble.
- Las alternativas deben ser decisiones o
  interpretaciones aplicadas.
- Feedback específico para las cuatro respuestas.
- maxAttempts: 3.
- debrief: síntesis pedagógica breve.

choose-your-path:
- EXACTAMENTE 4 options.
- Cada option: id, label, isPreferred,
  consequence, feedback.
- EXACTAMENTE UNA isPreferred=true.
- Plantea una situación realista.
- Explica las consecuencias de cada decisión.
- No confundas una consecuencia posible
  con un resultado garantizado.

==================================================
FORMATO DE QUICK-QUIZ
==================================================

{
  "subtitle": "Aplica lo aprendido",
  "visual": {
    "layout": "statement",
    "items": [
      {
        "title": "Caso práctico",
        "description": "Analiza la situación presentada."
      }
    ]
  },
  "teacher": {
    "explanation": "Identifica los intereses y las restricciones antes de decidir.",
    "transition": null
  },
  "activity": null,
  "interactionData": {
    "kind": "quick-quiz",
    "instruction": "El departamento de Operaciones necesita ampliar temporalmente su plantilla. Finanzas considera que no hay presupuesto disponible. Ambos departamentos deben mantener sus objetivos sin comprometer el proyecto.\\n\\n¿Cuál sería el primer paso más adecuado?",
    "options": [
      {
        "id": "a",
        "label": "Mantener la solicitud inicial sin introducir cambios.",
        "isPreferred": false,
        "feedback": "Insistir en la posición inicial no permite explorar las limitaciones de Finanzas."
      },
      {
        "id": "b",
        "label": "Analizar las necesidades y restricciones de ambas partes.",
        "isPreferred": true,
        "feedback": "Identificar los intereses reales permite buscar alternativas compatibles."
      },
      {
        "id": "c",
        "label": "Cancelar la ampliación sin estudiar otras posibilidades.",
        "isPreferred": false,
        "feedback": "Renunciar inmediatamente no resuelve la necesidad operativa."
      },
      {
        "id": "d",
        "label": "Trasladar directamente el desacuerdo a Dirección.",
        "isPreferred": false,
        "feedback": "Escalar el conflicto antes de explorar soluciones puede ser prematuro."
      }
    ],
    "debrief": "Una negociación eficaz comienza por comprender los intereses y restricciones de las partes.",
    "maxAttempts": 3
  },
  "estimatedMinutes": 2
}

Este ejemplo es exclusivamente estructural.
Adapta absolutamente todo el contenido a la lección.

==================================================
ACTIVIDADES ANTIGUAS
==================================================

Para quiz y decision:
- activity.kind debe coincidir con interaction.
- EXACTAMENTE 4 options.
- Cada option:
  id, label, consequence, feedback, isPreferred.
- EXACTAMENTE UNA isPreferred=true.
- scenario debe describir el caso en 3-5 frases.
- instruction debe contener la pregunta aplicada.
- assessmentCriteria y hints deben ser arrays
  no vacíos.
- minimumScore: 70.
- maxAttempts: 3.
- expectedLearning: objetivo específico.
- debrief: explicación pedagógica breve.

Para sorting:
- activity.kind = "sorting".
- options = [].
- groups: entre 2 y 4.
- sortItems: entre 3 y 8.
- Cada sortItem: id, label, groupId, feedback.
- Todos los groupId deben existir.
- Los ids deben ser únicos.
- scenario: contexto específico si resulta útil.
- assessmentCriteria y hints no vacíos.
- minimumScore: 70.
- maxAttempts: 3.

==================================================
VALIDACIÓN FINAL
==================================================

Antes de responder comprueba:
- JSON válido.
- Todos los campos obligatorios presentes.
- interactionData.kind correcto.
- activity=null para interacciones nuevas.
- Exactamente cuatro opciones en los test.
- Una única respuesta correcta.
- IDs únicos.
- Feedback para todas las alternativas.
- Categorías y relaciones coherentes.
- Caso y pregunta comprensibles.
- Sin afirmaciones inventadas.
`;

async function ask(
  client: OpenAI,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
): Promise<unknown> {
  const response = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.25,
    response_format: { type: "json_object" },
    messages,
  });

  const raw = response.choices[0]?.message?.content;

  if (!raw) {
    throw new Error("La IA devolvió una respuesta vacía.");
  }

  return JSON.parse(raw) as unknown;
}

function validPlan(value: unknown): value is LessonPlan {
  const data = record(value);

  if (
    !data ||
    typeof data.objective !== "string" ||
    typeof data.pedagogicalApproach !== "string" ||
    !strings(data.keyConcepts) ||
    !Array.isArray(data.screens)
  ) {
    return false;
  }

  const screens: unknown[] = data.screens;

  if (screens.length < 5 || screens.length > 14) {
    return false;
  }

  let lastPhase = -1;
  const ids = new Set<string>();

  for (const raw of screens) {
    const screen = record(raw);

    if (
      !screen ||
      typeof screen.id !== "string" ||
      !screen.id.trim() ||
      ids.has(screen.id) ||
      !DIDACTIC_PHASES.includes(
        screen.phase as DidacticPhase
      ) ||
      !SCREEN_TYPES.includes(
        screen.type as DidacticScreenType
      ) ||
      typeof screen.title !== "string" ||
      typeof screen.learningGoal !== "string" ||
      typeof screen.teachingStrategy !== "string" ||
      typeof screen.activityRequired !== "boolean" ||
      ![
        "none",
        "quiz",
        "sorting",
        "decision",
        ...INTERACTION_KINDS,
      ].includes(String(screen.interaction))
    ) {
      return false;
    }

    if (
      screen.interaction !== "none" &&
      !screen.activityRequired
    ) {
      return false;
    }

    ids.add(screen.id);

    const currentPhase = DIDACTIC_PHASES.indexOf(
      screen.phase as DidacticPhase
    );

    if (currentPhase < lastPhase) {
      return false;
    }

    lastPhase = currentPhase;
  }

  return (
    DIDACTIC_PHASES.every((phase) =>
      screens.some(
        (screen) => record(screen)?.phase === phase
      )
    ) &&
    screens.some((screen) => {
      const value = record(screen);

      return (
        value?.phase === "assessment" &&
        value.activityRequired === true
      );
    }) &&
    screens.filter(
      (screen) => record(screen)?.interaction !== "none"
    ).length >= 2
  );
}

function getPlanProblems(value: unknown): string[] {
  const data = record(value);
  const screens = Array.isArray(data?.screens)
    ? data.screens
    : [];

  const problems: string[] = [];

  if (
    typeof data?.objective !== "string" ||
    typeof data?.pedagogicalApproach !== "string" ||
    !strings(data?.keyConcepts)
  ) {
    problems.push("Faltan campos generales del guion");
  }

  if (screens.length < 5 || screens.length > 14) {
    problems.push(
      `Número de pantallas inválido: ${screens.length}`
    );
  }

  const ids = new Set<string>();
  let lastPhase = -1;

  screens.forEach((raw, index) => {
    const screen = record(raw);

    if (!screen) {
      problems.push(`Pantalla ${index + 1}: objeto inválido`);
      return;
    }

    for (const field of [
      "id",
      "phase",
      "type",
      "title",
      "learningGoal",
      "teachingStrategy",
      "interaction",
    ]) {
      if (
        typeof screen[field] !== "string" ||
        !(screen[field] as string).trim()
      ) {
        problems.push(
          `Pantalla ${index + 1}: falta ${field}`
        );
      }
    }

    if (typeof screen.id === "string") {
      if (ids.has(screen.id)) {
        problems.push(
          `Pantalla ${index + 1}: ID duplicado`
        );
      }

      ids.add(screen.id);
    }

    if (
      !DIDACTIC_PHASES.includes(
        screen.phase as DidacticPhase
      )
    ) {
      problems.push(
        `Pantalla ${index + 1}: fase inválida`
      );
    } else {
      const currentPhase = DIDACTIC_PHASES.indexOf(
        screen.phase as DidacticPhase
      );

      if (currentPhase < lastPhase) {
        problems.push(
          `Pantalla ${index + 1}: fase desordenada`
        );
      }

      lastPhase = currentPhase;
    }

    if (
      !SCREEN_TYPES.includes(
        screen.type as DidacticScreenType
      )
    ) {
      problems.push(
        `Pantalla ${index + 1}: tipo inválido`
      );
    }

    if (
      ![
        "none",
        "quiz",
        "sorting",
        "decision",
        ...INTERACTION_KINDS,
      ].includes(String(screen.interaction))
    ) {
      problems.push(
        `Pantalla ${index + 1}: interacción inválida`
      );
    }

    if (
      typeof screen.activityRequired !== "boolean" ||
      (screen.interaction !== "none" &&
        screen.activityRequired !== true)
    ) {
      problems.push(
        `Pantalla ${index + 1}: activityRequired inválido`
      );
    }
  });

  for (const phase of DIDACTIC_PHASES) {
    if (
      !screens.some(
        (screen) => record(screen)?.phase === phase
      )
    ) {
      problems.push(`Falta la fase ${phase}`);
    }
  }

  if (
    !screens.some((screen) => {
      const value = record(screen);

      return (
        value?.phase === "assessment" &&
        value.activityRequired === true
      );
    })
  ) {
    problems.push("Falta actividad en assessment");
  }

  if (
    screens.filter(
      (screen) => record(screen)?.interaction !== "none"
    ).length < 2
  ) {
    problems.push("Se requieren al menos dos interacciones");
  }

  return problems;
}

async function generatePlan(
  client: OpenAI,
  input: GenerateInput
): Promise<LessonPlan> {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
    [
      { role: "system", content: PLAN_PROMPT },
      { role: "user", content: JSON.stringify(input) },
    ];

  for (let attempt = 1; attempt <= 3; attempt++) {
    const candidate = await ask(client, messages);

    if (validPlan(candidate)) {
      console.info(
        `[Academy] Guion válido en intento ${attempt}`
      );

      return candidate;
    }

    const problems = getPlanProblems(candidate);

    console.warn(
      `[Academy] Guion inválido (${attempt}/3)`,
      problems
    );

    messages.push({
      role: "assistant",
      content: JSON.stringify(candidate),
    });

    messages.push({
      role: "user",
      content: `Corrige el guion JSON completo. Problemas: ${problems.join(
        "; "
      )}. Conserva los objetivos y el contenido pedagógico. Devuelve exclusivamente JSON.`,
    });
  }

  throw new Error(
    "No se ha podido generar un guion didáctico válido."
  );
}

function normalizeActivity(
  raw: unknown,
  plan: ScreenPlan
): DidacticActivity | null {
  if (
    plan.interaction === "none" ||
    isNewInteraction(plan.interaction)
  ) {
    return null;
  }

  const data = record(raw);

  if (!data) return null;

  const base = {
    kind: plan.interaction as
      | "quiz"
      | "sorting"
      | "decision",
    instruction: nonempty(
      data.instruction,
      plan.learningGoal
    ),
    expectedLearning: nonempty(
      data.expectedLearning,
      plan.learningGoal
    ),
    assessmentCriteria:
      strings(data.assessmentCriteria) &&
      data.assessmentCriteria.length
        ? data.assessmentCriteria
        : ["Aplicar correctamente el concepto estudiado."],
    hints:
      strings(data.hints) && data.hints.length
        ? data.hints
        : ["Revisa la situación y los intereses implicados."],
    minimumScore: 70,
    maxAttempts: 3,
    scenario:
      typeof data.scenario === "string"
        ? data.scenario
        : null,
    debrief:
      typeof data.debrief === "string"
        ? data.debrief
        : null,
  };

  if (plan.interaction === "sorting") {
    const groups = Array.isArray(data.groups)
      ? data.groups
          .map(record)
          .filter(
            (
              group
            ): group is Record<string, unknown> =>
              !!group
          )
          .map((group) => ({
            id: string(group.id),
            label: string(group.label),
          }))
      : [];

    const sortItems = Array.isArray(data.sortItems)
      ? data.sortItems
          .map(record)
          .filter(
            (
              item
            ): item is Record<string, unknown> =>
              !!item
          )
          .map((item) => ({
            id: string(item.id),
            label: string(item.label),
            groupId: string(item.groupId),
            feedback: string(item.feedback),
          }))
      : [];

    return {
      ...base,
      options: [],
      groups,
      sortItems,
    };
  }

  const options = Array.isArray(data.options)
    ? data.options
        .map(record)
        .filter(
          (
            option
          ): option is Record<string, unknown> =>
            !!option
        )
        .map((option) => ({
          id: string(option.id),
          label: string(option.label),
          consequence: string(option.consequence),
          feedback: string(option.feedback),
          isPreferred: option.isPreferred === true,
        }))
    : [];

  return {
    ...base,
    options,
  };
}

function normalizeInteraction(
  raw: unknown,
  plan: ScreenPlan
): InteractionData | null {
  if (!isNewInteraction(plan.interaction)) {
    return null;
  }

  const data = record(raw);

  if (!data) return null;

  return {
    ...data,
    kind: plan.interaction,
  } as InteractionData;
}

function buildScreen(
  plan: ScreenPlan,
  raw: unknown
): unknown {
  const data = record(raw);

  if (!data) return null;

  const teacher = record(data.teacher);
  const newInteraction = isNewInteraction(plan.interaction);

  const visual = newInteraction
    ? {
        layout: "statement",
        items: [
          {
            title: plan.title,
            description: plan.learningGoal,
          },
        ],
      }
    : data.visual;

  return {
    id: plan.id,
    phase: plan.phase,
    type: plan.type,
    title: plan.title,
    learningGoal: plan.learningGoal,
    teachingStrategy: plan.teachingStrategy,
    subtitle:
      typeof data.subtitle === "string"
        ? data.subtitle
        : null,
    visual,
    teacher: {
      explanation: string(teacher?.explanation),
      transition:
        typeof teacher?.transition === "string"
          ? teacher.transition
          : null,
    },
    activity: normalizeActivity(
      data.activity,
      plan
    ),
    interaction: normalizeInteraction(
      data.interactionData,
      plan
    ),
    estimatedMinutes:
      typeof data.estimatedMinutes === "number" &&
      Number.isFinite(data.estimatedMinutes) &&
      data.estimatedMinutes > 0
        ? data.estimatedMinutes
        : 2,
  };
}

function validateChoiceQuality(
  screen: DidacticScreen,
  plan: ScreenPlan
): string[] {
  if (!isChoiceInteraction(plan.interaction)) {
    return [];
  }

  const problems: string[] = [];

  const options = isNewInteraction(plan.interaction)
    ? screen.interaction?.options
    : screen.activity?.options;

  if (!options || options.length !== 4) {
    problems.push(
      "El cuestionario debe contener exactamente cuatro alternativas"
    );
    return problems;
  }

  if (
    options.filter(
      (option) => option.isPreferred === true
    ).length !== 1
  ) {
    problems.push(
      "Debe existir exactamente una respuesta correcta"
    );
  }

  if (
    options.some(
      (option) =>
        !option.label ||
        !option.label.trim() ||
        !option.feedback ||
        !option.feedback.trim()
    )
  ) {
    problems.push(
      "Todas las alternativas necesitan texto y feedback"
    );
  }

  const labels = options.map((option) =>
    option.label.trim().toLowerCase()
  );

  if (new Set(labels).size !== labels.length) {
    problems.push("Hay respuestas duplicadas");
  }

  const scenario = isNewInteraction(plan.interaction)
    ? screen.interaction?.instruction ?? ""
    : screen.activity?.scenario ?? "";

  if (scenario.trim().length < 100) {
    problems.push(
      "El caso práctico es demasiado breve: describe participantes, necesidades y conflicto"
    );
  }

  if (
    isNewInteraction(plan.interaction) &&
    scenario.trim().length > 0 &&
    !scenario.includes("?") &&
    !scenario.includes("¿")
  ) {
    problems.push(
      "La instrucción debe incluir una pregunta explícita"
    );
  }

  if (
    !isNewInteraction(plan.interaction) &&
    (screen.activity?.instruction.trim().length ?? 0) <
      25
  ) {
    problems.push(
      "La pregunta es demasiado breve o poco concreta"
    );
  }

  return problems;
}

function getScreenProblems(
  candidate: unknown,
  plan: ScreenPlan
): string[] {
  const problems: string[] = [];

  if (!validateDidacticScreen(candidate)) {
    problems.push(
      "La estructura general de la pantalla no es válida"
    );
  }

  const screen = record(candidate);

  if (!screen) {
    return ["La pantalla no es un objeto"];
  }

  const interaction = screen.interaction;

  if (isNewInteraction(plan.interaction)) {
    if (!validateInteraction(interaction)) {
      problems.push(
        `interactionData no cumple el contrato de ${plan.interaction}`
      );
    } else if (interaction.kind !== plan.interaction) {
      problems.push(
        `Se esperaba ${plan.interaction} y se recibió ${interaction.kind}`
      );
    }
  } else if (plan.interaction !== "none") {
    const activity = record(screen.activity);

    if (activity?.kind !== plan.interaction) {
      problems.push(
        `activity.kind debe ser ${plan.interaction}`
      );
    }
  }

  if (
    validateDidacticScreen(candidate) &&
    isChoiceInteraction(plan.interaction)
  ) {
    problems.push(
      ...validateChoiceQuality(candidate, plan)
    );
  }

  return problems;
}


async function generateScreen(
  client: OpenAI,
  input: GenerateInput,
  lesson: LessonPlan,
  plan: ScreenPlan,
  position: number
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
        module: input.moduleTitle,
        lesson: input.lessonTitle,
        originalContent: input.content,
        lessonObjective: lesson.objective,
        outline: lesson.screens.map((screen) => ({
          id: screen.id,
          title: screen.title,
          interaction: screen.interaction,
        })),
        currentScreen: plan,
        position,
        total: lesson.screens.length,
      }),
    },
  ];

  const newKind = isNewInteraction(plan.interaction);
  const choiceKind = isChoiceInteraction(plan.interaction);

  for (let attempt = 1; attempt <= 3; attempt++) {
    const raw = await ask(client, messages);
    const candidate = buildScreen(plan, raw);
    const problems = getScreenProblems(candidate, plan);

    if (
      problems.length === 0 &&
      validateDidacticScreen(candidate)
    ) {
      return candidate;
    }

    const instructions: string[] = [
      "Devuelve el JSON completo de la pantalla.",
      "Conserva el objetivo pedagógico.",
      "Respeta los tipos y campos del contrato.",
      "No inventes información.",
    ];

    if (newKind) {
      instructions.push(
        "activity debe ser null.",
        `interactionData.kind debe ser "${plan.interaction}".`
      );
    } else if (plan.interaction === "none") {
      instructions.push(
        "activity debe ser null.",
        "interactionData debe ser null."
      );
    } else {
      instructions.push(
        `activity.kind debe ser "${plan.interaction}".`,
        "interactionData debe ser null."
      );
    }

    switch (plan.interaction) {
      case "put-in-order":
        instructions.push(
          "Genera entre 3 y 7 items.",
          "Cada item necesita id y label no vacíos.",
          "Los ids deben ser únicos.",
          "Coloca los items en el orden CORRECTO.",
          "El reproductor los mezclará posteriormente.",
          "No generes options ni grupos.",
          "Elige pasos con una secuencia inequívoca."
        );
        break;

      case "sort-it":
        instructions.push(
          "Genera entre 2 y 4 grupos.",
          "Genera entre 3 y 8 elementos.",
          "Cada grupo necesita id y label.",
          "Cada elemento necesita id, label y groupId.",
          "Todos los groupId deben existir.",
          "Los ids deben ser únicos.",
          "La clasificación debe ser inequívoca."
        );
        break;

      case "match-pairs":
        instructions.push(
          "Genera entre 2 y 6 parejas.",
          "Cada elemento necesita id y label.",
          "Los elementos izquierdos tienen matchId.",
          "Los elementos derechos no tienen matchId.",
          "Cada matchId apunta a un id derecho existente.",
          "Todos los ids deben ser únicos."
        );
        break;

      case "flip-cards":
        instructions.push(
          "Genera entre 2 y 6 tarjetas.",
          "Cada tarjeta necesita id, label y description.",
          "Las descripciones deben aportar aprendizaje real."
        );
        break;

      case "flip-challenge":
        instructions.push(
          "Genera exactamente cuatro opciones.",
          "Cada opción necesita id, label y feedback.",
          "Exactamente una debe tener isPreferred=true.",
          "Las cuatro alternativas deben ser plausibles."
        );
        break;

      case "quick-quiz":
      case "choose-your-path":
      case "quiz":
      case "decision":
        instructions.push(
          "Describe un caso empresarial comprensible.",
          "Formula una pregunta aplicada.",
          "Genera exactamente cuatro alternativas.",
          "Exactamente una debe tener isPreferred=true.",
          "Las otras tres deben ser distractores plausibles.",
          "Incluye feedback específico para todas.",
          "Evita respuestas obvias o ambiguas."
        );

        if (plan.interaction === "choose-your-path") {
          instructions.push(
            "Incluye consequence en cada alternativa."
          );
        }
        break;

      case "sorting":
        instructions.push(
          "Genera entre 2 y 4 grupos.",
          "Genera entre 3 y 8 sortItems.",
          "Cada sortItem necesita id, label, groupId y feedback.",
          "Todos los groupId deben existir.",
          "Incluye options como array vacío."
        );
        break;

      case "none":
        instructions.push(
          "Genera contenido visual explicativo.",
          "No generes actividades."
        );
        break;
    }

    console.warn(
      `[Academy] Pantalla "${plan.title}" inválida (${attempt}/3)`,
      {
        kind: plan.interaction,
        problems,
        screenValid: validateDidacticScreen(candidate),
      }
    );

    messages.push({
      role: "assistant",
      content: JSON.stringify(raw),
    });

    messages.push({
      role: "user",
      content: [
        "El JSON anterior no supera la validación.",
        "",
        "Problemas detectados:",
        ...problems.map((problem) => `- ${problem}`),
        "",
        "Instrucciones de corrección:",
        ...instructions.map((instruction) => `- ${instruction}`),
        "",
        "Devuelve únicamente el JSON corregido.",
      ].join("\n"),
    });
  }

  throw new Error(
    `No se ha podido desarrollar "${plan.title}". Comprueba la actividad ${plan.interaction}.`
  );
}


export async function generateDidacticPackage(
  input: GenerateInput
): Promise<DidacticPackage> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "Falta configurar OPENAI_API_KEY."
    );
  }

  if (!input.content.trim()) {
    throw new Error(
      "La lección no tiene contenido."
    );
  }

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const plan = await generatePlan(client, input);

  console.info(
    `[Academy] Guion válido: ${plan.screens.length} pantallas.`
  );

  const screens: DidacticScreen[] = [];

  for (
    let start = 0;
    start < plan.screens.length;
    start += 3
  ) {
    const batch = await Promise.all(
      plan.screens
        .slice(start, start + 3)
        .map((screen, index) =>
          generateScreen(
            client,
            input,
            plan,
            screen,
            start + index + 1
          )
        )
    );

    screens.push(...batch);

    console.info(
      `[Academy] Desarrolladas ${screens.length}/${plan.screens.length} pantallas.`
    );
  }

  const result: DidacticPackage = {
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

  if (!validateDidacticPackage(result)) {
    throw new Error(
      "El paquete didáctico no supera la validación final."
    );
  }

  console.info(
    `[Academy] Clase generada correctamente: ${screens.length} pantallas.`
  );

  return result;
}
