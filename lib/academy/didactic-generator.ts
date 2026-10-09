
 // lib/academy/didactic-generator.ts

import OpenAI from "openai";

import {
  validateInteraction,
  type InteractionData,
  INTERACTION_KINDS,
} from "./interaction-schema";


import {
  PEDAGOGICAL_PLANNING_PROMPT,
  buildPlanningRequirements,
  normalizePedagogicalProfile,
} from "./didactic-planning-policy";


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
${PEDAGOGICAL_PLANNING_PROMPT}

Eres el director pedagógico de Crussader Academy.

Diseña el guion completo de UNA lección empresarial.
Primero determina qué necesita aprender el alumno y
después distribuye ese aprendizaje en pantallas.

Devuelve exclusivamente JSON válido.

ESTRUCTURA OBLIGATORIA:

{
  "objective": "Objetivo concreto y evaluable",
  "pedagogicalApproach": "Estrategia didáctica",
  "keyConcepts": [
    "Concepto fundamental 1",
    "Concepto fundamental 2"
  ],
  "screens": [
    {
      "id": "screen-01",
      "phase": "introduction",
      "type": "concept",
      "title": "Título específico",
      "learningGoal": "Qué aprenderá el alumno",
      "teachingStrategy": "Qué debe explicarse, demostrarse o practicarse",
      "activityRequired": false,
      "interaction": "none"
    }
  ]
}

OBJETIVO PEDAGÓGICO

El alumno debe terminar comprendiendo y sabiendo
aplicar los conocimientos esenciales de la lección.

No generes una presentación superficial ni una
sucesión de definiciones acompañadas de preguntas.

ANÁLISIS PREVIO

Antes de construir el guion:

1. Identifica los objetivos de aprendizaje.
2. Extrae los conceptos fundamentales.
3. Identifica las técnicas, procesos y herramientas.
4. Determina qué conocimientos previos son necesarios.
5. Detecta relaciones y diferencias entre conceptos.
6. Identifica errores profesionales habituales.
7. Selecciona aplicaciones y ejemplos concretos.
8. Determina qué conocimientos deben evaluarse.

No omitas conceptos importantes para reducir el
número de pantallas.

DESARROLLO DE CONTENIDOS

Para cada concepto importante, contempla:

- Definición y significado.
- Explicación de cómo funciona.
- Utilidad en el entorno profesional.
- Condiciones y límites de aplicación.
- Diferencias respecto a conceptos relacionados.
- Ejemplos reales o hipotéticos identificables.
- Errores habituales.
- Consecuencias de aplicar mal el concepto.

No todos los conceptos necesitan todos los apartados.
Selecciona los relevantes para cada materia.

La explicación debe ser suficientemente profunda
para el nivel de la lección.

SECUENCIA PEDAGÓGICA

Organiza el aprendizaje desde la comprensión
hasta la aplicación:

1. Contextualizar.
2. Explicar los fundamentos necesarios.
3. Desarrollar técnicas y herramientas.
4. Mostrar ejemplos y casos profesionales.
5. Practicar la toma de decisiones.
6. Evaluar la aplicación de lo aprendido.
7. Sintetizar y facilitar su transferencia al trabajo.

FASES OBLIGATORIAS

Utiliza estas fases, en este orden:

introduction
development
assessment
reflection

Todas deben aparecer.

introduction:
- Presenta el problema profesional.
- Explica la utilidad del aprendizaje.
- Evita introducciones excesivas.

development:
- Contiene la mayor parte de la enseñanza.
- Explica conceptos, técnicas y procesos.
- Introduce ejemplos y comparaciones.
- Construye progresivamente el conocimiento.

assessment:
- Incluye al menos una evaluación aplicada.
- Evalúa conocimientos realmente enseñados.
- Evita preguntas triviales.

reflection:
- Resume los aprendizajes fundamentales.
- Identifica aplicaciones en el trabajo.
- Evita repetir literalmente las explicaciones.

TIPOS DE PANTALLA PERMITIDOS

${SCREEN_TYPES.join(", ")}

INTERACCIONES PERMITIDAS PARA CLASES NUEVAS

none
flip-cards
quick-quiz

No generes:
quiz, sorting, decision, flip-challenge,
match-pairs, sort-it, put-in-order,
choose-your-path.

Estos tipos pueden existir en clases antiguas,
pero no deben aparecer en guiones nuevos.

REGLAS DE INTERACCIÓN

none:
- Pantalla de enseñanza.
- activityRequired=false.
- Debe aportar información sustantiva.

flip-cards:
- Explorar conceptos o comparaciones.
- Descubrir características y ejemplos.
- activityRequired=true.
- Evita tarjetas con información trivial.

quick-quiz:
- Aplicar conocimientos.
- Analizar casos empresariales.
- Tomar decisiones.
- Evaluar razonamiento.
- activityRequired=true.

No coloques ejercicios en todas las pantallas.

No introduzcas interacciones por variedad visual.

Las simulaciones se desarrollan mediante
varias pantallas quick-quiz conectadas por
un escenario y unos participantes coherentes.

CALIDAD DE LAS EVALUACIONES

- Evalúa conceptos explicados previamente.
- Utiliza casos profesionales concretos.
- Exige interpretar, decidir o aplicar.
- Evita preguntas de memoria literal.
- No reveles la respuesta en el enunciado.
- Utiliza distractores profesionales plausibles.
- Incluye evaluación de errores habituales.

COBERTURA DEL TEMARIO

Cada concepto esencial debe aparecer en una
pantalla explicativa antes de ser evaluado.

No basta con mencionarlo en el título.

No introduzcas conceptos nuevos exclusivamente
en la evaluación.

Evita pantallas redundantes y objetivos duplicados.

DURACIÓN Y EXTENSIÓN

Adapta el número de pantallas a:
- Duración objetivo.
- Complejidad.
- Nivel.
- Densidad del contenido.
- Tiempo de lectura.
- Tiempo de práctica.

No generes pantallas vacías para alcanzar
una cantidad determinada.

No comprimas excesivamente una materia compleja.

Respeta los límites técnicos de pantallas
proporcionados por el servidor.

FIABILIDAD

Utiliza la documentación proporcionada como
fuente de referencia para contenidos corporativos.

Puedes enriquecer con conocimiento general
cuando las instrucciones de la lección lo permitan.

Distingue ejemplos hipotéticos de hechos reales.

No inventes procedimientos internos, normativas,
datos, cifras, fuentes ni políticas corporativas.

CALIDAD FINAL

Antes de devolver el guion, verifica:

- Objetivos concretos.
- Conceptos fundamentales cubiertos.
- Progresión lógica.
- Explicaciones antes de evaluaciones.
- Ejemplos profesionales.
- Técnicas aplicables.
- Ausencia de repeticiones.
- Interacciones permitidas.
- Fases correctas.
- Estructura JSON válida.

Devuelve únicamente el JSON.
`;



const SCREEN_PROMPT = `
Eres un especialista en diseño instruccional,
formación empresarial y aprendizaje aplicado.

Desarrolla UNA pantalla del guion pedagógico.

Tu misión es convertir su objetivo en contenido
formativo útil, riguroso y profesional.

Devuelve exclusivamente JSON válido.
No devuelvas markdown ni explicaciones externas.

ESTRUCTURA OBLIGATORIA

{
  "subtitle": null,
  "visual": {
    "layout": "explore",
    "items": [
      {
        "title": "Título del contenido",
        "description": "Explicación desarrollada"
      }
    ]
  },
  "teacher": {
    "explanation": "Aclaración complementaria",
    "transition": null
  },
  "activity": null,
  "interactionData": null,
  "estimatedMinutes": 2
}

No devuelvas:
id, phase, type, title ni learningGoal.

El servidor incorpora esos campos.

==================================================
PRINCIPIO FUNDAMENTAL
==================================================

El contenido debe enseñar, no decorar.

No generes tarjetas con frases genéricas.

No conviertas conceptos importantes en
definiciones de una sola línea.

No repitas el título de la pantalla.

Cada pantalla debe desarrollar un aprendizaje
específico del guion.

La profundidad debe ser proporcional al
objetivo, nivel y complejidad.

==================================================
DESARROLLO PEDAGÓGICO
==================================================

Cuando corresponda, explica:

1. Qué es el concepto.
2. Cómo funciona.
3. Por qué resulta importante.
4. Cuándo se utiliza.
5. Cómo se aplica.
6. Qué errores deben evitarse.
7. Qué limitaciones presenta.
8. Un ejemplo profesional concreto.

No es obligatorio incluir los ocho elementos
en todas las pantallas.

Prioriza los que aporten valor al aprendizaje.

Las explicaciones deben permitir que el
alumno comprenda la materia sin depender
de información externa.

Evita:
- Frases motivacionales vacías.
- Repeticiones.
- Explicaciones circulares.
- Definiciones demasiado genéricas.
- Consejos obvios.
- Conclusiones sin contenido.
- Ejemplos irrelevantes.

Prioriza:
- Técnicas aplicables.
- Métodos y procedimientos.
- Relaciones entre conceptos.
- Comparaciones.
- Ejemplos profesionales.
- Errores frecuentes.
- Decisiones justificadas.
- Consecuencias y limitaciones.

==================================================
CONTENIDO VISUAL
==================================================

Layouts permitidos:

cards
steps
columns
statement
scenario
timeline
diagram
explore

Genera entre 1 y 6 elementos visuales.

Elige el layout según la naturaleza
del contenido, no por variedad estética.

cards:
Conceptos diferenciados o aspectos relacionados.

steps:
Secuencias y procedimientos.

columns:
Comparaciones entre enfoques.

statement:
Idea principal con explicación.

scenario:
Situaciones empresariales.

timeline:
Evolución temporal.

diagram:
Relaciones entre elementos.

explore:
Desarrollo de conceptos complementarios.

CAMPOS

title:
- Claro y específico.
- Preferiblemente menos de 50 caracteres.

description:
- Explicación sustantiva.
- Incluye información concreta.
- Evita repetir el título.
- Utiliza varias frases cuando sea necesario.
- Prioriza claridad frente a brevedad artificial.

No conviertas una explicación compleja en
un eslogan para ajustarla a una longitud.

Si el contenido requiere mayor desarrollo,
distribúyelo en varios elementos relacionados.

No añadas elementos vacíos para rellenar.

==================================================
EJEMPLOS PROFESIONALES
==================================================

Los ejemplos deben tener:

- Un contexto concreto.
- Participantes identificables.
- Objetivos o necesidades.
- Una dificultad o decisión.
- Una aplicación del concepto explicado.

Evita ejemplos abstractos como:

"Dos departamentos tienen un problema
y deben comunicarse mejor".

Prefiere situaciones con restricciones
y decisiones reconocibles.

Los ejemplos hipotéticos no deben
presentarse como hechos reales.

==================================================
PROFESOR ACADEMY
==================================================

teacher.explanation:
- Debe aportar una aclaración adicional.
- Puede explicar una limitación o error frecuente.
- Puede mostrar una aplicación alternativa.
- No debe repetir el contenido principal.
- Utiliza un lenguaje natural y profesional.

teacher.transition:
- Texto breve que conecte con el
  siguiente aprendizaje.
- Utiliza null si no aporta valor.

El profesor es complementario.
La pantalla debe comprenderse sin abrirlo.

==================================================
INTERACCIONES PERMITIDAS
==================================================

Para nuevas clases utiliza exclusivamente:

none
flip-cards
quick-quiz

No generes otros tipos de interacción.

REGLAS DE ESTRUCTURA

Si currentScreen.interaction es "none":
- activity=null.
- interactionData=null.

Si currentScreen.interaction es "flip-cards"
o "quick-quiz":
- activity=null.
- interactionData contiene el ejercicio.
- interactionData.kind coincide exactamente
  con currentScreen.interaction.

Todas las interacciones necesitan
un campo instruction no vacío.

==================================================
FLIP-CARDS
==================================================

Utiliza tarjetas para explorar conceptos,
comparaciones, técnicas o ejemplos.

Formato:

{
  "kind": "flip-cards",
  "instruction": "Explora los conceptos fundamentales.",
  "items": [
    {
      "id": "card-1",
      "label": "Concepto visible",
      "description": "Explicación desarrollada y útil."
    },
    {
      "id": "card-2",
      "label": "Segundo concepto",
      "description": "Explicación desarrollada y útil."
    }
  ],
  "debrief": "Síntesis de lo aprendido."
}

REGLAS

- Entre 2 y 6 tarjetas.
- Cada tarjeta necesita id, label y description.
- Todos los ids deben ser únicos.
- Las descripciones deben aportar conocimiento.
- No repitas literalmente el contenido visual.
- No generes tarjetas de una sola palabra
  sin una explicación significativa.
- Utiliza ejemplos cuando aporten claridad.
- Evita tarjetas redundantes.

==================================================
QUICK-QUIZ
==================================================

Utiliza el cuestionario minimalista para:

- Aplicación de conceptos.
- Decisiones profesionales.
- Análisis de situaciones.
- Evaluación.
- Simulaciones encadenadas.

ESTRUCTURA

{
  "kind": "quick-quiz",
  "instruction": "Caso empresarial desarrollado.\\n\\n¿Qué decisión sería más adecuada?",
  "options": [
    {
      "id": "a",
      "label": "Primera alternativa plausible.",
      "isPreferred": false,
      "feedback": "Explicación específica."
    },
    {
      "id": "b",
      "label": "Segunda alternativa plausible.",
      "isPreferred": true,
      "feedback": "Justificación específica."
    },
    {
      "id": "c",
      "label": "Tercera alternativa plausible.",
      "isPreferred": false,
      "feedback": "Explicación específica."
    },
    {
      "id": "d",
      "label": "Cuarta alternativa plausible.",
      "isPreferred": false,
      "feedback": "Explicación específica."
    }
  ],
  "debrief": "Conclusión pedagógica.",
  "maxAttempts": 3
}

REGLAS DEL CASO

El caso debe incluir:

- Participantes.
- Contexto profesional.
- Objetivos o intereses.
- Restricciones relevantes.
- Problema o decisión.

Utiliza aproximadamente entre 3 y 6 frases
cuando la complejidad lo requiera.

La situación debe ser comprensible por sí misma.

Después del caso incluye una pregunta explícita.

Separa el caso y la pregunta mediante
dos saltos de línea.

REGLAS DE LAS ALTERNATIVAS

- Exactamente cuatro opciones.
- Una única isPreferred=true.
- Tres alternativas incorrectas plausibles.
- Todas responden a la misma pregunta.
- Longitudes y detalles similares.
- Evita respuestas evidentemente absurdas.
- No utilices "todas las anteriores".
- No utilices "ninguna de las anteriores".
- No hagas siempre correcta la opción B.
- Distribuye las respuestas correctas.
- Evita copiar literalmente el enunciado.

Los distractores deben representar errores
profesionales verosímiles.

REGLAS DEL FEEDBACK

Cada alternativa necesita feedback.

Explica:
- Por qué la decisión funciona o no.
- Qué concepto interviene.
- Qué consecuencias son posibles.
- Qué alternativa sería preferible,
  cuando corresponda.

No uses únicamente:
"Correcto".
"Incorrecto".
"Buena respuesta".

Evita consecuencias exageradas
o presentadas como inevitables.

==================================================
SIMULACIONES
==================================================

Una simulación utiliza varias pantallas
quick-quiz relacionadas.

Mantén:
- Los mismos participantes.
- El mismo contexto.
- Los objetivos de cada parte.
- La evolución coherente del problema.

Cada pantalla presenta una nueva decisión.

Ejemplo de progresión:

1. Preparación de la negociación.
2. Primera propuesta.
3. Aparición de una objeción.
4. Gestión de una concesión.
5. Cierre del acuerdo.

No reutilices automáticamente este ejemplo.

Adapta la simulación al contenido real.

Cada pregunta debe poder comprenderse
aunque el alumno no recuerde todos los
detalles de las pantallas anteriores.

==================================================
CALIDAD DE LAS PREGUNTAS
==================================================

Los cuestionarios deben evaluar
razonamiento, no reconocimiento textual.

Evita preguntas como:

"¿Qué es la escucha activa?"

Prefiere:

"Un responsable detecta que su interlocutor
repite una exigencia, pero evita explicar
sus motivos. ¿Qué actuación ayudaría
a identificar sus intereses reales?"

Las opciones deben exigir comprender
la técnica y sus límites.

==================================================
DURACIÓN ESTIMADA
==================================================

estimatedMinutes debe representar el
tiempo razonable para:

- Leer y comprender.
- Analizar ejemplos.
- Explorar tarjetas.
- Resolver preguntas.
- Revisar feedback.

No asignes duraciones arbitrarias
para alcanzar el tiempo objetivo.

==================================================
FIABILIDAD
==================================================

Respeta la documentación proporcionada.

No inventes:
- Procedimientos internos.
- Políticas corporativas.
- Normas legales.
- Estadísticas.
- Referencias.
- Certificaciones.
- Hechos atribuidos a empresas.

Puedes utilizar ejemplos hipotéticos
cuando estén permitidos.

==================================================
VALIDACIÓN FINAL
==================================================

Antes de devolver el JSON:

1. Comprueba la estructura.
2. Verifica que visual contiene 1-6 items.
3. Comprueba los campos obligatorios.
4. Verifica que interactionData.kind coincide.
5. Comprueba que instruction existe.
6. Verifica los ids únicos.
7. Comprueba las cuatro opciones del quick-quiz.
8. Comprueba una única respuesta preferente.
9. Verifica feedback en todas las opciones.
10. Comprueba que el contenido enseña algo real.
11. Evita repeticiones.
12. No inventes información.
13. Devuelve únicamente JSON válido.
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


function normalizeScreenType(
  value: unknown
): DidacticScreenType {
  if (
    typeof value === "string" &&
    SCREEN_TYPES.includes(
      value as DidacticScreenType
    )
  ) {
    return value as DidacticScreenType;
  }

  const aliases: Record<string, DidacticScreenType> = {
    introduction: "concept",
    explanation: "concept",
    theory: "concept",
    overview: "summary",
    recap: "summary",
    conclusion: "summary",
    reflection: "analysis",
    discussion: "analysis",
    practice: "exercise",
    activity: "exercise",
    quiz: "exercise",
    "quick-quiz": "exercise",
    "flip-cards": "concept",
    "flip-challenge": "exercise",
    "put-in-order": "process",
    "match-pairs": "exercise",
    "sort-it": "exercise",
    "choose-your-path": "decision",
    example: "case",
    scenario: "case",
    workflow: "process",
    steps: "process",
  };

  const key =
    typeof value === "string"
      ? value.trim().toLowerCase()
      : "";

  return aliases[key] ?? "concept";
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

  const defaultInstructions: Record<
    InteractionData["kind"],
    string
  > = {
    "flip-cards":
      "Explora las tarjetas para comprender los conceptos principales.",
    "flip-challenge":
      "Analiza la situación y selecciona la alternativa más adecuada.",
    "match-pairs":
      "Relaciona cada concepto con su correspondencia.",
    "sort-it":
      "Clasifica cada elemento en la categoría correcta.",
    "put-in-order":
      "Ordena los pasos del proceso siguiendo su secuencia correcta.",
    "quick-quiz":
      "Analiza el caso y selecciona la respuesta más adecuada.",
    "choose-your-path":
      "Examina la situación y elige cómo actuarías.",
  };

  return {
    ...data,
    kind: plan.interaction,
    instruction: nonempty(
      data.instruction,
      defaultInstructions[plan.interaction]
    ),
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


const isDecisionSimulation =
  plan.interaction === "choose-your-path";

const minimumScenarioLength = isDecisionSimulation
  ? 60
  : 100;

if (scenario.trim().length < minimumScenarioLength) {
  problems.push(
    isDecisionSimulation
      ? "La simulación necesita un contexto concreto: participantes, intereses y decisión que debe tomarse"
      : "El caso práctico es demasiado breve: describe participantes, necesidades y conflicto"
  );
}

if (
  !isDecisionSimulation &&
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

    
const planData = record(raw);

if (planData && Array.isArray(planData.screens)) {
  for (const entry of planData.screens) {
    const screen = record(entry);

    if (screen) {
      screen.type = normalizeScreenType(screen.type);
    }
  }
}

    const candidate = buildScreen(plan, raw);

    
if (
  isNewInteraction(plan.interaction) &&
  !validateDidacticScreen(candidate)
) {
  const generated = record(raw);
  const interaction = record(
    generated?.interactionData
  );

  console.error(
    "[Academy] Diagnóstico de interacción:",
    JSON.stringify(
      {
        screen: plan.title,
        expectedKind: plan.interaction,
        rawKeys: generated
          ? Object.keys(generated)
          : [],
        rawInteraction: generated?.interactionData,
        normalizedInteraction:
          record(candidate)?.interaction,
        itemsCount: Array.isArray(interaction?.items)
          ? interaction.items.length
          : null,
        optionsCount: Array.isArray(interaction?.options)
          ? interaction.options.length
          : null,
      },
      null,
      2
    )
  );
}

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
