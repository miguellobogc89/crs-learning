
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
  | "summary";

export type DidacticScreen = {
  id: string;
  phase: DidacticPhase;
  type: DidacticScreenType;
  title: string;
  subtitle: string | null;
  visual: {
    layout: "cards" | "steps" | "columns" | "statement";
    items: Array<{
      title: string;
      description: string;
    }>;
  };
  teacher: {
    explanation: string;
    transition: string | null;
  };
  activity: null | {
    instruction: string;
    expectedLearning: string;
    assessmentCriteria: string[];
    hints: string[];
    minimumScore: number;
    maxAttempts: number;
  };
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
};

export const DIDACTIC_PHASES: DidacticPhase[] = [
  "introduction",
  "development",
  "assessment",
  "reflection",
];

export function validateDidacticPackage(
  value: unknown,
): value is DidacticPackage {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return false;
  }

  const data = value as Partial<DidacticPackage>;

  if (
    data.version !== DIDACTIC_PACKAGE_VERSION ||
    typeof data.lessonId !== "string" ||
    typeof data.lessonTitle !== "string" ||
    typeof data.objective !== "string" ||
    !Array.isArray(data.screens) ||
    !Array.isArray(data.sources)
  ) {
    return false;
  }

  if (data.screens.length < 6 || data.screens.length > 14) {
    return false;
  }

  const ids = new Set<string>();

  for (const screen of data.screens) {
    if (
      !screen ||
      typeof screen.id !== "string" ||
      ids.has(screen.id) ||
      !DIDACTIC_PHASES.includes(screen.phase) ||
      !["concept", "comparison", "case", "process", "exercise", "summary"].includes(screen.type) ||
      typeof screen.title !== "string" ||
      typeof screen.teacher?.explanation !== "string" ||
      !screen.visual ||
      !["cards", "steps", "columns", "statement"].includes(screen.visual.layout) ||
      !Array.isArray(screen.visual.items) ||
      screen.visual.items.length < 1 ||
      screen.visual.items.length > 6
    ) {
      return false;
    }

    ids.add(screen.id);

    if (
      screen.visual.items.some(
        (item) =>
          typeof item.title !== "string" ||
          typeof item.description !== "string",
      )
    ) {
      return false;
    }

    if (screen.activity !== null) {
      if (
        !screen.activity ||
        typeof screen.activity.instruction !== "string" ||
        typeof screen.activity.expectedLearning !== "string" ||
        !Array.isArray(screen.activity.assessmentCriteria) ||
        screen.activity.assessmentCriteria.length < 1 ||
        !Array.isArray(screen.activity.hints) ||
        screen.activity.hints.length < 1 ||
        typeof screen.activity.minimumScore !== "number" ||
        screen.activity.minimumScore < 0 ||
        screen.activity.minimumScore > 100 ||
        !Number.isInteger(screen.activity.maxAttempts) ||
        screen.activity.maxAttempts < 1
      ) {
        return false;
      }
    }
  }

  const phases = data.screens.map((screen) =>
    DIDACTIC_PHASES.indexOf(screen.phase),
  );

  if (
    phases.some((phase) => phase < 0) ||
    phases.some(
      (phase, index) =>
        index > 0 && phase < phases[index - 1],
    )
  ) {
    return false;
  }

  for (const phase of DIDACTIC_PHASES) {
    if (!data.screens.some((screen) => screen.phase === phase)) {
      return false;
    }
  }

  if (
    !data.screens.some(
      (screen) =>
        screen.phase === "assessment" &&
        screen.activity !== null,
    )
  ) {
    return false;
  }

  return data.sources.every(
    (source) =>
      typeof source.title === "string" &&
      (source.author === null || typeof source.author === "string") &&
      (source.url === null || typeof source.url === "string") &&
      typeof source.relevance === "string" &&
      source.verificationStatus === "pending",
  );
}
