
/**
 * lib/academy/didactic-planning-policy.ts
 *
 * Política pedagógica de Crussader Academy.
 *
 * Se aplica a la generación de clases nuevas.
 * Los paquetes existentes mantienen sus contratos.
 */

export const NEW_INTERACTION_KINDS = [
  "none",
  "flip-cards",
  "quick-quiz",
] as const;

export type NewInteractionKind =
  (typeof NEW_INTERACTION_KINDS)[number];

export type LessonDepth =
  | "basic"
  | "intermediate"
  | "advanced";

export type ContentOrigin =
  | "corporate"
  | "general"
  | "mixed";

export type PedagogicalProfile = {
  targetMinutes: number;
  depth: LessonDepth;
  origin: ContentOrigin;
};

export type CoverageRequirement = {
  concept: string;
  importance: "essential" | "supporting";
  expectedApplication: string;
};

export const DEFAULT_PEDAGOGICAL_PROFILE: PedagogicalProfile = {
  targetMinutes: 15,
  depth: "intermediate",
  origin: "mixed",
};

export function normalizePedagogicalProfile(
  input?: Partial<PedagogicalProfile>
): PedagogicalProfile {
  const minutes = Number(input?.targetMinutes);

  const targetMinutes = Number.isFinite(minutes)
    ? Math.max(5, Math.min(60, Math.round(minutes)))
    : DEFAULT_PEDAGOGICAL_PROFILE.targetMinutes;

  const depth: LessonDepth =
    input?.depth === "basic" ||
    input?.depth === "intermediate" ||
    input?.depth === "advanced"
      ? input.depth
      : DEFAULT_PEDAGOGICAL_PROFILE.depth;

  const origin: ContentOrigin =
    input?.origin === "corporate" ||
    input?.origin === "general" ||
    input?.origin === "mixed"
      ? input.origin
      : DEFAULT_PEDAGOGICAL_PROFILE.origin;

  return {
    targetMinutes,
    depth,
    origin,
  };
}

export function getScreenBudget(
  targetMinutes: number
): {
  minimum: number;
  recommended: number;
  maximum: number;
} {
  const minutes = Math.max(
    5,
    Math.min(60, targetMinutes)
  );

  // Estimación orientativa: no es una cuota obligatoria.
  // Una explicación extensa puede necesitar más tiempo
  // que una pantalla de lectura breve.
  return {
    minimum: Math.max(3, Math.floor(minutes / 2)),
    recommended: Math.max(
      4,
      Math.round(minutes * 0.8)
    ),
    maximum: Math.min(
      40,
      Math.max(6, Math.ceil(minutes * 1.2))
    ),
  };
}

export const PEDAGOGICAL_PLANNING_PROMPT = `
Eres el director pedagógico de Crussader Academy.

Tu objetivo es diseñar formación empresarial rigurosa,
útil, profesional y orientada a la aplicación real.

PRINCIPIO FUNDAMENTAL

No diseñes primero pantallas.
Primero determina qué debe aprender el alumno.

El curso debe tener profundidad suficiente para que
el alumno comprenda, relacione y aplique conceptos.

No conviertas una materia compleja en una sucesión
de definiciones superficiales.

PLANIFICACIÓN

1. Analiza el contenido original.
2. Identifica los objetivos de aprendizaje.
3. Determina los conocimientos necesarios.
4. Organiza los conceptos en una secuencia coherente.
5. Desarrolla ejemplos y aplicaciones profesionales.
6. Identifica errores y confusiones habituales.
7. Diseña prácticas que evalúen la aplicación.
8. Comprueba la cobertura antes de finalizar.

PROFUNDIDAD

Cada concepto esencial debe contemplar, cuando
corresponda:

- Qué significa.
- Por qué es importante.
- Cómo funciona.
- Cuándo se utiliza.
- Qué errores deben evitarse.
- Un ejemplo profesional concreto.
- Cómo aplicarlo en una situación real.

No es necesario que cada concepto ocupe una pantalla.
Distribuye el contenido de forma natural.

CALIDAD DEL CONTENIDO

Evita:
- Definiciones repetidas.
- Introducciones innecesariamente largas.
- Frases genéricas sin información útil.
- Ejemplos donde la respuesta es evidente.
- Pantallas de relleno.
- Conclusiones que repiten literalmente lo anterior.
- Explicaciones artificialmente fragmentadas.

Prioriza:
- Técnicas y métodos aplicables.
- Comparaciones que aclaren diferencias.
- Casos empresariales realistas.
- Razonamiento y toma de decisiones.
- Ejemplos concretos.
- Progresión desde comprensión hasta aplicación.

FUENTES Y FIABILIDAD

Distingue entre:
- Información aportada por la empresa.
- Conocimiento profesional general.
- Ejemplos hipotéticos creados para enseñar.

Nunca presentes un ejemplo inventado como un hecho.

No inventes:
- Procedimientos internos.
- Políticas corporativas.
- Normas legales.
- Certificaciones.
- Cifras o estadísticas.
- Referencias documentales.

Si el contenido original es insuficiente, no simules
que existe documentación adicional.

Cuando esté permitido enriquecer con conocimiento
general, hazlo sin atribuirlo a la empresa.

INTERACCIONES NUEVAS

Utiliza exclusivamente:

1. none:
   Contenido explicativo y visual.

2. flip-cards:
   Conceptos, comparaciones o descubrimiento guiado.
   Cada tarjeta debe aportar información sustantiva.

3. quick-quiz:
   Aplicación, decisión, simulación o evaluación.
   Exactamente cuatro alternativas.
   Una única respuesta preferente.
   Tres distractores plausibles.
   Feedback específico para cada alternativa.

Una simulación puede estar compuesta por varios
quick-quiz conectados por un mismo escenario.

No introduzcas otros tipos de interacción.

EVALUACIÓN

Evalúa comprensión y aplicación.

No preguntes algo cuya respuesta esté copiada
literalmente en el enunciado.

No utilices distractores absurdos.

Las respuestas incorrectas deben representar
errores profesionales verosímiles.

DURACIÓN

La duración es un objetivo de diseño, no una
justificación para crear pantallas vacías.

Distribuye el tiempo según:
- Complejidad de los conceptos.
- Lectura real.
- Análisis de ejemplos.
- Resolución de ejercicios.
- Reflexión y síntesis.

Una pantalla con una frase no equivale a
un minuto de formación.

RESULTADO ESPERADO

El alumno debe terminar con conocimientos y
herramientas que pueda aplicar en su trabajo.

La prioridad es la calidad del aprendizaje,
no el número de pantallas ni de interacciones.
`;

export function buildPlanningRequirements(
  profileInput?: Partial<PedagogicalProfile>
): string {
  const profile = normalizePedagogicalProfile(
    profileInput
  );

  const budget = getScreenBudget(
    profile.targetMinutes
  );

  const levelInstructions: Record<
    LessonDepth,
    string
  > = {
    basic:
      "Explica los fundamentos, introduce el vocabulario y utiliza ejemplos accesibles.",
    intermediate:
      "Prioriza técnicas, relaciones entre conceptos, errores frecuentes y aplicación profesional.",
    advanced:
      "Profundiza en decisiones complejas, limitaciones, casos ambiguos y análisis crítico.",
  };

  const sourceInstructions: Record<
    ContentOrigin,
    string
  > = {
    corporate:
      "Utiliza únicamente la documentación corporativa suministrada. No añadas políticas o procedimientos externos.",
    general:
      "Puedes utilizar conocimiento profesional general consolidado. No inventes fuentes ni datos verificables.",
    mixed:
      "Utiliza la documentación aportada como base. Puedes enriquecer con conocimiento profesional general, distinguiéndolo de las reglas internas.",
  };

  return [
    `DURACIÓN OBJETIVO: ${profile.targetMinutes} minutos.`,
    `NIVEL: ${profile.depth}.`,
    levelInstructions[profile.depth],
    `ORIGEN DEL CONTENIDO: ${profile.origin}.`,
    sourceInstructions[profile.origin],
    "",
    "PRESUPUESTO ORIENTATIVO DE PANTALLAS:",
    `Mínimo orientativo: ${budget.minimum}.`,
    `Recomendación: ${budget.recommended}.`,
    `Máximo: ${budget.maximum}.`,
    "",
    "No fuerces el número recomendado.",
    "No generes pantallas sin contenido suficiente.",
    "No elimines conceptos importantes solo para reducir pantallas.",
    "",
    "INTERACCIONES PERMITIDAS:",
    NEW_INTERACTION_KINDS.join(", "),
    "",
    "El temario debe cubrir los conceptos fundamentales",
    "antes de convertirlos en pantallas.",
  ].join("\n");
}

export function isNewInteractionKind(
  value: unknown
): value is NewInteractionKind {
  return (
    typeof value === "string" &&
    NEW_INTERACTION_KINDS.some(
      (kind) => kind === value
    )
  );
}

export function validateCoverageRequirements(
  value: unknown
): value is CoverageRequirement[] {
  if (!Array.isArray(value)) return false;

  return value.every((entry) => {
    if (
      !entry ||
      typeof entry !== "object" ||
      Array.isArray(entry)
    ) {
      return false;
    }

    const requirement =
      entry as Record<string, unknown>;

    return (
      typeof requirement.concept === "string" &&
      requirement.concept.trim().length > 0 &&
      (requirement.importance === "essential" ||
        requirement.importance === "supporting") &&
      typeof requirement.expectedApplication ===
        "string" &&
      requirement.expectedApplication.trim().length > 0
    );
  });
}
