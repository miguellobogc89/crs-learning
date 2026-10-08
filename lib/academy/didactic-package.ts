
 // lib/academy/didactic-package.ts

export const DIDACTIC_PACKAGE_VERSION = 1;

export type DidacticPhase =
  | "introduction"
  | "development"
  | "assessment"
  | "reflection";

export type DidacticScreenType =
  | "concept"
  | "comparison"
  | "case"
  | "process"
  | "exercise"
  | "summary"
  | "decision"
  | "simulation"
  | "analysis"
  | "demonstration";

export type DidacticVisualLayout =
  | "cards"
  | "steps"
  | "columns"
  | "statement"
  | "scenario"
  | "timeline"
  | "diagram";

export type DidacticActivityType =
  | "open_response"
  | "decision"
  | "case_analysis"
  | "simulation"
  | "reflection";

export type DidacticActivityOption = {
  id: string;
  label: string;
  consequence: string;
  feedback: string;
  isPreferred: boolean;
};

export type DidacticActivity = {
  instruction: string;
  expectedLearning: string;
  assessmentCriteria: string[];
  hints: string[];
  minimumScore: number;
  maxAttempts: number;
  kind?: DidacticActivityType;
  scenario?: string | null;
  options?: DidacticActivityOption[];
  debrief?: string | null;
};

export type DidacticScreen = {
  id: string;
  phase: DidacticPhase;
  type: DidacticScreenType;
  title: string;
  subtitle: string | null;
  visual: {
    layout: DidacticVisualLayout;
    items: {
      title: string;
      description: string;
    }[];
  };
  teacher: {
    explanation: string;
    transition: string | null;
  };
  activity: DidacticActivity | null;
  learningGoal?: string;
  estimatedMinutes?: number;
  teachingStrategy?: string;
};

export type DidacticSource = {
  title: string;
  author: string | null;
  url: string | null;
  relevance: string;
  verificationStatus: "pending" | "verified";
};

export type DidacticPackage = {
  version: 1;
  lessonId: string;
  lessonTitle: string;
  objective: string;
  screens: DidacticScreen[];
  sources: DidacticSource[];
  generatedAt: string;
  status: "draft";
  pedagogicalApproach?: string;
  prerequisites?: string[];
  keyConcepts?: string[];
};

export const DIDACTIC_PHASES: DidacticPhase[] = [
  "introduction",
  "development",
  "assessment",
  "reflection",
];

const SCREEN_TYPES: DidacticScreenType[] = [
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

const LAYOUTS: DidacticVisualLayout[] = [
  "cards",
  "steps",
  "columns",
  "statement",
  "scenario",
  "timeline",
  "diagram",
];

const ACTIVITY_TYPES: DidacticActivityType[] = [
  "open_response",
  "decision",
  "case_analysis",
  "simulation",
  "reflection",
];

function record(
  value: unknown,
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function strings(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "string")
  );
}

function nullableString(value: unknown): boolean {
  return value === null || typeof value === "string";
}

function validActivity(value: unknown): boolean {
  if (!record(value)) return false;

  if (
    typeof value.instruction !== "string" ||
    typeof value.expectedLearning !== "string" ||
    !strings(value.assessmentCriteria) ||
    value.assessmentCriteria.length === 0 ||
    !strings(value.hints) ||
    value.hints.length === 0 ||
    typeof value.minimumScore !== "number" ||
    !Number.isFinite(value.minimumScore) ||
    value.minimumScore < 0 ||
    value.minimumScore > 100 ||
    typeof value.maxAttempts !== "number" ||
    !Number.isInteger(value.maxAttempts) ||
    value.maxAttempts < 1
  ) {
    return false;
  }

  if (
    value.kind !== undefined &&
    !ACTIVITY_TYPES.includes(
      value.kind as DidacticActivityType,
    )
  ) {
    return false;
  }

  if (
    value.scenario !== undefined &&
    !nullableString(value.scenario)
  ) {
    return false;
  }

  if (
    value.debrief !== undefined &&
    !nullableString(value.debrief)
  ) {
    return false;
  }

  if (value.options !== undefined) {
    if (!Array.isArray(value.options)) return false;

    const ids = new Set<string>();

    for (const option of value.options) {
      if (
        !record(option) ||
        typeof option.id !== "string" ||
        !option.id.trim() ||
        ids.has(option.id) ||
        typeof option.label !== "string" ||
        typeof option.consequence !== "string" ||
        typeof option.feedback !== "string" ||
        typeof option.isPreferred !== "boolean"
      ) {
        return false;
      }

      ids.add(option.id);
    }
  }

  if (value.kind === "decision") {
    if (
      !Array.isArray(value.options) ||
      value.options.length < 2 ||
      value.options.length > 4 ||
      !value.options.some(
        (option: unknown) =>
          record(option) && option.isPreferred === true,
      )
    ) {
      return false;
    }
  }

  return true;
}

export function validateDidacticScreen(
  value: unknown,
): value is DidacticScreen {
  if (!record(value)) return false;

  if (
    typeof value.id !== "string" ||
    !value.id.trim() ||
    !DIDACTIC_PHASES.includes(value.phase as DidacticPhase) ||
    !SCREEN_TYPES.includes(value.type as DidacticScreenType) ||
    typeof value.title !== "string" ||
    !nullableString(value.subtitle)
  ) {
    return false;
  }

  if (!record(value.visual) || !record(value.teacher)) {
    return false;
  }

  const visual = value.visual;
  const teacher = value.teacher;

  if (
    !LAYOUTS.includes(
      visual.layout as DidacticVisualLayout,
    ) ||
    !Array.isArray(visual.items) ||
    visual.items.length < 1 ||
    visual.items.length > 6 ||
    !visual.items.every(
      (item: unknown) =>
        record(item) &&
        typeof item.title === "string" &&
        typeof item.description === "string",
    )
  ) {
    return false;
  }

  if (
    typeof teacher.explanation !== "string" ||
    !nullableString(teacher.transition)
  ) {
    return false;
  }

  if (
    value.activity !== null &&
    !validActivity(value.activity)
  ) {
    return false;
  }

  if (
    value.learningGoal !== undefined &&
    typeof value.learningGoal !== "string"
  ) {
    return false;
  }

  if (
    value.teachingStrategy !== undefined &&
    typeof value.teachingStrategy !== "string"
  ) {
    return false;
  }

  if (
    value.estimatedMinutes !== undefined &&
    (
      typeof value.estimatedMinutes !== "number" ||
      !Number.isFinite(value.estimatedMinutes) ||
      value.estimatedMinutes <= 0
    )
  ) {
    return false;
  }

  return true;
}

export function validateDidacticPackage(
  value: unknown,
): value is DidacticPackage {
  if (!record(value)) return false;

  if (
    value.version !== DIDACTIC_PACKAGE_VERSION ||
    typeof value.lessonId !== "string" ||
    typeof value.lessonTitle !== "string" ||
    typeof value.objective !== "string" ||
    typeof value.generatedAt !== "string" ||
    value.status !== "draft" ||
    !Array.isArray(value.screens) ||
    !Array.isArray(value.sources)
  ) {
    return false;
  }

  // Se admiten cinco pantallas como mínimo.
  if (
    value.screens.length < 5 ||
    value.screens.length > 14 ||
    !value.screens.every(validateDidacticScreen)
  ) {
    return false;
  }

  const screens = value.screens as DidacticScreen[];

  if (
    new Set(screens.map((screen) => screen.id)).size !==
    screens.length
  ) {
    return false;
  }

  let previousPhase = -1;

  for (const screen of screens) {
    const phaseIndex = DIDACTIC_PHASES.indexOf(
      screen.phase,
    );

    if (phaseIndex < previousPhase) return false;

    previousPhase = phaseIndex;
  }

  for (const phase of DIDACTIC_PHASES) {
    if (!screens.some((screen) => screen.phase === phase)) {
      return false;
    }
  }

  if (
    !screens.some(
      (screen) =>
        screen.phase === "assessment" &&
        screen.activity !== null,
    )
  ) {
    return false;
  }

  if (
    !value.sources.every(
      (source: unknown) =>
        record(source) &&
        typeof source.title === "string" &&
        nullableString(source.author) &&
        nullableString(source.url) &&
        typeof source.relevance === "string" &&
        (
          source.verificationStatus === "pending" ||
          source.verificationStatus === "verified"
        ),
    )
  ) {
    return false;
  }

  if (
    value.pedagogicalApproach !== undefined &&
    typeof value.pedagogicalApproach !== "string"
  ) {
    return false;
  }

  if (
    value.prerequisites !== undefined &&
    !strings(value.prerequisites)
  ) {
    return false;
  }

  if (
    value.keyConcepts !== undefined &&
    !strings(value.keyConcepts)
  ) {
    return false;
  }

  return true;
}
