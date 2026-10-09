// lib/academy/didactic-generator.ts
import OpenAI from "openai";
import {validateInteraction, type InteractionData, INTERACTION_KINDS} from "./interaction-schema";
import {
  DIDACTIC_PHASES, SCREEN_TYPES, validateDidacticPackage, validateDidacticScreen,
  type DidacticPackage, type DidacticScreen, type DidacticPhase, type DidacticScreenType,
  type DidacticActivity,
} from "@/lib/academy/didactic-package";

type GenerateInput = { lessonId: string; lessonTitle: string; moduleTitle: string; courseTitle: string; courseDescription: string | null; content: string };
type ScreenPlan = { id: string; phase: DidacticPhase; type: DidacticScreenType; title: string; learningGoal: string; teachingStrategy: string; activityRequired: boolean; interaction: "none" | "quiz" | "sorting" | "decision" | InteractionData["kind"] };
type LessonPlan = { objective: string; pedagogicalApproach: string; keyConcepts: string[]; screens: ScreenPlan[] };
const MODEL = "gpt-4o";
const record = (v: unknown): Record<string, unknown> | null => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === "string");
const string = (v: unknown, fallback = "") => typeof v === "string" ? v : fallback;
const nonempty = (v: unknown, fallback: string) => typeof v === "string" && v.trim() ? v : fallback;
const PLAN_PROMPT = `Eres diseñador instruccional de formación empresarial. Diseña SOLO el guion JSON, sin texto fuera.
Devuelve {"objective":"...","pedagogicalApproach":"...","keyConcepts":["..."],"screens":[{"id":"intro-01","phase":"introduction","type":"case","title":"...","learningGoal":"...","teachingStrategy":"...","activityRequired":false,"interaction":"none"}]}.
Diseña entre 8 y 12 pantallas cortas, máximo 14; fases introduction, development, assessment, reflection en orden, todas presentes. Debe existir una actividad en assessment.
La experiencia debe alternar exploración visual y microejercicios. Cada 2 o 3 pantallas aproximadamente, un ejercicio quiz, sorting o decision, según la materia. Evita ejercicios de redacción: se reservan para evaluación final futura.
Usa interaction: none | quiz | sorting | decision | flip-cards | flip-challenge | match-pairs | sort-it | put-in-order | quick-quiz | choose-your-path. Al menos dos actividades interactivas y preferiblemente dos modalidades distintas. Si interaction != none, activityRequired=true. No pongas actividades en todas las pantallas. Tipos de pantalla permitidos: ${SCREEN_TYPES.join(", ")}.
No inventes datos, referencias ni afirmaciones pseudocientíficas. La secuencia debe ser específica al contenido y no seguir siempre la misma plantilla.`;


const SCREEN_PROMPT = `Desarrolla UNA pantalla del guion como JSON, sin markdown ni texto fuera.
Devuelve {"subtitle":null,"visual":{"layout":"explore","items":[{"title":"...","description":"..."}]},"teacher":{"explanation":"...","transition":null},"activity":null,"estimatedMinutes":2}.
Layouts permitidos: cards, steps, columns, statement, scenario, timeline, diagram, explore. Preferir explore para tarjetas verticales interactivas; 2-5 tarjetas con textos muy breves (title <= 50 caracteres, description <= 190). En cualquier layout, 1-6 items. Evita párrafos largos.
Profesor: explicación breve (idealmente <= 350 caracteres), útil, sin repetir las tarjetas. Transición breve o null.
Si la pantalla requiere actividad, crea activity con TODOS estos campos: kind, instruction, scenario, expectedLearning, assessmentCriteria, hints, minimumScore, maxAttempts, options, debrief. Usa minimumScore=70, maxAttempts=3, assessmentCriteria y hints arrays no vacíos.
Para quiz o decision: kind igual a interaction. options entre 2 y 4; cada una {"id":"a","label":"...","consequence":"...","feedback":"...","isPreferred":false}. EXACTAMENTE UNA alternativa isPreferred=true; distractores plausibles; feedback específico y pedagógico.
Para sorting: kind="sorting", options=[], groups=[{"id":"g1","label":"..."},{"id":"g2","label":"..."}], sortItems=[{"id":"i1","label":"...","groupId":"g1","feedback":"..."}]. Usa 2-3 grupos y 3-6 elementos; clasificaciones objetivas y no ambiguas.
Si interaction es uno de los siete tipos nuevos, devuelve activity=null y además un objeto interactionData:
{"kind":"flip-cards","instruction":"...","items":[{"id":"a","label":"...","description":"..."}]}.
Reglas por kind:
flip-cards: 2-6 items con id,label,description.
flip-challenge: 2-4 options con id,label,isPreferred,feedback,consequence; exactamente una correcta y explica todas.
match-pairs: 2-6 items izquierdos con matchId apuntando al id de un item derecho, más los items derechos sin matchId; todos con id,label, sin duplicados.
sort-it: 2-4 groups con id,label; 3-8 items con id,label,groupId válido,feedback.
put-in-order: 3-7 items con id,label EN ORDEN CORRECTO; el reproductor los mezcla.
quick-quiz: 2-4 options con exactamente una isPreferred=true y feedback para todas.
choose-your-path: 2-4 options con exactamente una isPreferred=true y consequence y feedback para todas.


Ejemplo completo para quick-quiz:
{
  "subtitle": "Comprueba lo aprendido",
  "visual": {
    "layout": "statement",
    "items": [
      {
        "title": "Evaluación",
        "description": "Aplica el concepto estudiado."
      }
    ]
  },
  "teacher": {
    "explanation": "Recuerda aplicar los principios estudiados.",
    "transition": null
  },
  "activity": null,
  "interactionData": {
    "kind": "quick-quiz",
    "instruction": "¿Qué alternativa representa la actuación correcta?",
    "options": [
      {
        "id": "a",
        "label": "Alternativa correcta",
        "isPreferred": true,
        "feedback": "Explicación de por qué es correcta."
      },
      {
        "id": "b",
        "label": "Alternativa incorrecta",
        "isPreferred": false,
        "feedback": "Explicación de por qué no es adecuada."
      }
    ],
    "maxAttempts": 3
  },
  "estimatedMinutes": 2
}
El ejemplo solo ilustra la estructura. Sustituye todo su contenido por preguntas y respuestas específicas de la lección.


No generes datos ambiguos. Los ids deben ser únicos. Para los tipos antiguos quiz, sorting y decision, usa activity como antes.
Si interaction="none", activity=null e interactionData=null. No inventes una actividad escrita. El contenido debe ser específico a la lección, no genérico.
No devuelvas id, phase, type, title ni learningGoal. Los añade el servidor.`;
async function ask(client: OpenAI, messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]) {
  const response = await client.chat.completions.create({ model: MODEL, temperature: 0.25, response_format: { type: "json_object" }, messages });
  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error("La IA devolvió una respuesta vacía.");
  return JSON.parse(raw) as unknown;
}
function validPlan(value: unknown): value is LessonPlan {
  const d = record(value);
  if (!d || typeof d.objective !== "string" || typeof d.pedagogicalApproach !== "string" || !strings(d.keyConcepts) || !Array.isArray(d.screens)) return false;
  const screens: unknown[] = d.screens;
  if (screens.length < 5 || screens.length > 14) return false;
  let last = -1;
  const ids = new Set<string>();
  for (const raw of screens) {
    const s = record(raw);
    if (!s || typeof s.id !== "string" || !s.id || ids.has(s.id) || !DIDACTIC_PHASES.includes(s.phase as DidacticPhase) ||
      !SCREEN_TYPES.includes(s.type as DidacticScreenType) || typeof s.title !== "string" || typeof s.learningGoal !== "string" ||
      typeof s.teachingStrategy !== "string" || typeof s.activityRequired !== "boolean" ||
      !["none", "quiz", "sorting", "decision", ...INTERACTION_KINDS].includes(String(s.interaction))) return false;
    if (s.interaction !== "none" && !s.activityRequired) return false;
    ids.add(s.id);
    const current = DIDACTIC_PHASES.indexOf(s.phase as DidacticPhase);
    if (current < last) return false;
    last = current;
  }
  return DIDACTIC_PHASES.every(p => screens.some(s => record(s)?.phase === p)) &&
    screens.some(s => record(s)?.phase === "assessment" && record(s)?.activityRequired === true) &&
    screens.filter(s => record(s)?.interaction !== "none").length >= 2;
}


async function generatePlan(
  client: OpenAI,
  input: GenerateInput
): Promise<LessonPlan> {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
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

    const d = record(candidate);
    const screens = Array.isArray(d?.screens)
      ? d.screens
      : [];

    const problems: string[] = [];

    if (screens.length < 5 || screens.length > 14) {
      problems.push(
        `Número de pantallas inválido: ${screens.length}`
      );
    }

    const phases = screens.map(
      (s) => record(s)?.phase
    );

    for (const phase of DIDACTIC_PHASES) {
      if (!phases.includes(phase)) {
        problems.push(`Falta fase: ${phase}`);
      }
    }

    const ids = screens.map((s) => record(s)?.id);

    if (new Set(ids).size !== ids.length) {
      problems.push("Hay IDs duplicados");
    }

    screens.forEach((raw, index) => {
      const s = record(raw);

      if (!s) {
        problems.push(`Pantalla ${index + 1}: objeto inválido`);
        return;
      }

      const requiredStrings = [
        "id",
        "phase",
        "type",
        "title",
        "learningGoal",
        "teachingStrategy",
        "interaction",
      ];

      for (const field of requiredStrings) {
        if (
          typeof s[field] !== "string" ||
          !(s[field] as string).trim()
        ) {
          problems.push(
            `Pantalla ${index + 1}: falta ${field}`
          );
        }
      }

      if (
        ![
          "none",
          "quiz",
          "sorting",
          "decision",
          ...INTERACTION_KINDS,
        ].includes(String(s.interaction))
      ) {
        problems.push(
          `Pantalla ${index + 1}: interacción desconocida ${String(
            s.interaction
          )}`
        );
      }

      if (
        typeof s.activityRequired !== "boolean"
      ) {
        problems.push(
          `Pantalla ${index + 1}: activityRequired no es boolean`
        );
      }

      if (
        s.interaction !== "none" &&
        s.activityRequired !== true
      ) {
        problems.push(
          `Pantalla ${index + 1}: actividad no marcada como obligatoria`
        );
      }
    });

    const phaseIndexes = phases.map((phase) =>
      DIDACTIC_PHASES.indexOf(phase as DidacticPhase)
    );

    if (
      phaseIndexes.some(
        (phase, index) =>
          index > 0 && phase < phaseIndexes[index - 1]
      )
    ) {
      problems.push("Las fases están desordenadas");
    }

    const assessmentWithActivity = screens.some(
      (raw) => {
        const s = record(raw);
        return (
          s?.phase === "assessment" &&
          s.activityRequired === true
        );
      }
    );

    if (!assessmentWithActivity) {
      problems.push(
        "No existe una actividad en assessment"
      );
    }

    const interactionCount = screens.filter(
      (raw) => record(raw)?.interaction !== "none"
    ).length;

    if (interactionCount < 2) {
      problems.push(
        `Solo hay ${interactionCount} interacciones`
      );
    }

    console.warn(
      `[Academy] Guion inválido, intento ${attempt}/3`,
      {
        problems,
        screens: screens.map((raw) => {
          const s = record(raw);
          return {
            id: s?.id,
            phase: s?.phase,
            type: s?.type,
            interaction: s?.interaction,
            activityRequired: s?.activityRequired,
          };
        }),
      }
    );

    messages.push({
      role: "assistant",
      content: JSON.stringify(candidate),
    });

    messages.push({
      role: "user",
      content: `Corrige el guion completo. Problemas detectados: ${
        problems.length
          ? problems.join("; ")
          : "Alguna condición del contrato no se cumple. Revisa los tipos y campos."
      }. Devuelve únicamente el JSON corregido.`,
    });
  }

  throw new Error(
    "No se ha podido generar un guion didáctico válido."
  );
}



function normalizeActivity(raw: unknown, plan: ScreenPlan): DidacticActivity | null {
  if (plan.interaction === "none" || INTERACTION_KINDS.includes(plan.interaction as InteractionData["kind"])) return null;
  const d = record(raw);
  if (!d) return null; // Nunca fabricar una respuesta correcta ni opciones.
  const base = {
  kind: plan.interaction as "quiz" | "sorting" | "decision",
    instruction: nonempty(d.instruction, plan.learningGoal),
    expectedLearning: nonempty(d.expectedLearning, plan.learningGoal),
    assessmentCriteria: strings(d.assessmentCriteria) && d.assessmentCriteria.length ? d.assessmentCriteria : ["Selecciona una respuesta y razona su efecto."],
    hints: strings(d.hints) && d.hints.length ? d.hints : ["Revisa los conceptos de esta pantalla."],
    minimumScore: 70, maxAttempts: 3,
    scenario: typeof d.scenario === "string" ? d.scenario : null,
    debrief: typeof d.debrief === "string" ? d.debrief : null,
  };
  if (plan.interaction === "sorting") {
    const groups = Array.isArray(d.groups) ? d.groups.map(record).filter((g): g is Record<string, unknown> => !!g)
      .map(g => ({ id: string(g.id), label: string(g.label) })) : [];
    const sortItems = Array.isArray(d.sortItems) ? d.sortItems.map(record).filter((i): i is Record<string, unknown> => !!i)
      .map(i => ({ id: string(i.id), label: string(i.label), groupId: string(i.groupId), feedback: string(i.feedback) })) : [];
    return { ...base, options: [], groups, sortItems };
  }
  const options = Array.isArray(d.options) ? d.options.map(record).filter((o): o is Record<string, unknown> => !!o)
    .map(o => ({ id: string(o.id), label: string(o.label), consequence: string(o.consequence), feedback: string(o.feedback), isPreferred: o.isPreferred === true })) : [];
  return { ...base, options };
}


function buildScreen(plan: ScreenPlan, raw: unknown): unknown {
  const d = record(raw);
  if (!d) return null;

  const teacher = record(d.teacher);

  const isNewInteraction = INTERACTION_KINDS.includes(
    plan.interaction as InteractionData["kind"]
  );

  const interactionData = isNewInteraction
    ? record(d.interactionData)
    : null;

  const generatedVisual = record(d.visual);

  // Las interacciones nuevas tienen su propia interfaz.
  // El visual se conserva como dato de compatibilidad,
  // pero no debe impedir generar una actividad válida.
  const visual = isNewInteraction
    ? {
        layout: "statement",
        items: [
          {
            title: plan.title,
            description: plan.learningGoal,
          },
        ],
      }
    : generatedVisual;

  return {
    id: plan.id,
    phase: plan.phase,
    type: plan.type,
    title: plan.title,
    learningGoal: plan.learningGoal,
    teachingStrategy: plan.teachingStrategy,
    subtitle:
      typeof d.subtitle === "string" ? d.subtitle : null,
    visual,
    teacher: {
      explanation: string(teacher?.explanation),
      transition:
        typeof teacher?.transition === "string"
          ? teacher.transition
          : null,
    },
    activity: normalizeActivity(d.activity, plan),
    interaction: interactionData,
    estimatedMinutes:
      typeof d.estimatedMinutes === "number" &&
      Number.isFinite(d.estimatedMinutes) &&
      d.estimatedMinutes > 0
        ? d.estimatedMinutes
        : 2,
  };
}


async function generateScreen(client: OpenAI, input: GenerateInput, lesson: LessonPlan, plan: ScreenPlan, position: number): Promise<DidacticScreen> {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SCREEN_PROMPT },
    { role: "user", content: JSON.stringify({ course: input.courseTitle, lesson: input.lessonTitle, originalContent: input.content,
      lessonObjective: lesson.objective, outline: lesson.screens.map(s => ({ id: s.id, title: s.title, interaction: s.interaction })),
      currentScreen: plan, position, total: lesson.screens.length }) },
  ];
  for (let attempt = 1; attempt <= 3; attempt++) {
    const raw = await ask(client, messages);
    const candidate = buildScreen(plan, raw);
    if (validateDidacticScreen(candidate) && (plan.interaction === "none" || (INTERACTION_KINDS.includes(plan.interaction as InteractionData["kind"]) ? validateInteraction(candidate.interaction) && candidate.interaction.kind === plan.interaction : candidate.activity?.kind === plan.interaction))) return candidate;

console.warn(
  `[Academy] Pantalla "${plan.title}" inválida (${attempt}/3)`,
  {
    expectedKind: plan.interaction,
    screenValid: validateDidacticScreen(candidate),
    interactionValid:
      candidate &&
      typeof candidate === "object" &&
      "interaction" in candidate
        ? validateInteraction(candidate.interaction)
        : false,
    generatedInteraction:
      raw && typeof raw === "object" && "interactionData" in raw
        ? raw.interactionData
        : null,
    generatedVisual:
      raw && typeof raw === "object" && "visual" in raw
        ? raw.visual
        : null,
  }
);

    messages.push({ role: "assistant", content: JSON.stringify(raw) });
    messages.push({ role: "user", content: `Corrige el JSON completo. El contrato requiere visual.items válidos, teacher completo y activity con kind=${plan.interaction}. Si es quiz/decision, 2-4 options y exactamente una preferible. Si es sorting, groups (2-4) y sortItems (2-8) con groupId existente, ids únicos. Si es un tipo nuevo, activity=null e interactionData válido según las reglas. Si es none, activity=null e interactionData=null. No omitas campos.` });
  }
  throw new Error(`No se ha podido desarrollar "${plan.title}". Comprueba la actividad ${plan.interaction}.`);
}
export async function generateDidacticPackage(input: GenerateInput): Promise<DidacticPackage> {
  if (!process.env.OPENAI_API_KEY) throw new Error("Falta configurar OPENAI_API_KEY.");
  if (!input.content.trim()) throw new Error("La lección no tiene contenido.");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const plan = await generatePlan(client, input);
  console.info(`[Academy] Guion válido: ${plan.screens.length} pantallas.`);
  const screens: DidacticScreen[] = [];
  for (let start = 0; start < plan.screens.length; start += 3) {
    const batch = await Promise.all(plan.screens.slice(start, start + 3).map((s, i) => generateScreen(client, input, plan, s, start + i + 1)));
    screens.push(...batch);
    console.info(`[Academy] Desarrolladas ${screens.length}/${plan.screens.length} pantallas.`);
  }
  const result: DidacticPackage = { version: 1, lessonId: input.lessonId, lessonTitle: input.lessonTitle,
    objective: plan.objective, pedagogicalApproach: plan.pedagogicalApproach, keyConcepts: plan.keyConcepts,
    prerequisites: [], screens, sources: [], generatedAt: new Date().toISOString(), status: "draft" };
  if (!validateDidacticPackage(result)) throw new Error("El paquete didáctico no supera la validación final.");
  console.info(`[Academy] Clase generada correctamente: ${screens.length} pantallas.`);
  return result;
}
