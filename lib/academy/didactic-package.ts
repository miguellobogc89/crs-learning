// lib/academy/didactic-package.ts
export const DIDACTIC_PACKAGE_VERSION = 1;
export const DIDACTIC_PHASES = ["introduction", "development", "assessment", "reflection"] as const;
export type DidacticPhase = typeof DIDACTIC_PHASES[number];
export const SCREEN_TYPES = ["concept", "comparison", "case", "process", "exercise", "summary", "decision", "simulation", "analysis", "demonstration"] as const;
export type DidacticScreenType = typeof SCREEN_TYPES[number];
export const LAYOUTS = ["cards", "steps", "columns", "statement", "scenario", "timeline", "diagram", "explore"] as const;
export type DidacticVisualLayout = typeof LAYOUTS[number];
export const ACTIVITY_TYPES = ["open_response", "decision", "case_analysis", "simulation", "reflection", "quiz", "sorting"] as const;
export type DidacticActivityType = typeof ACTIVITY_TYPES[number];
export type DidacticActivityOption = { id: string; label: string; consequence: string; feedback: string; isPreferred: boolean };
export type DidacticActivity = {
  instruction: string; expectedLearning: string; assessmentCriteria: string[]; hints: string[];
  minimumScore: number; maxAttempts: number; kind?: DidacticActivityType;
  scenario?: string | null; options?: DidacticActivityOption[]; debrief?: string | null;
  // sorting: options are items, groups are drop targets; option.groupId is its correct group.
  groups?: { id: string; label: string }[];
  sortItems?: { id: string; label: string; groupId: string; feedback: string }[];
};
export type DidacticScreen = {
  id: string; phase: DidacticPhase; type: DidacticScreenType; title: string; subtitle: string | null;
  visual: { layout: DidacticVisualLayout; items: { title: string; description: string }[] };
  teacher: { explanation: string; transition: string | null };
  activity: DidacticActivity | null; learningGoal?: string; estimatedMinutes?: number; teachingStrategy?: string;
};
export type DidacticSource = { title: string; author: string | null; url: string | null; relevance: string; verificationStatus: "pending" | "verified" };
export type DidacticPackage = {
  version: 1; lessonId: string; lessonTitle: string; objective: string; screens: DidacticScreen[];
  sources: DidacticSource[]; generatedAt: string; status: "draft";
  pedagogicalApproach?: string; prerequisites?: string[]; keyConcepts?: string[];
};
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === "string";
const nullable = (v: unknown) => v === null || str(v);
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(str);
const oneOf = (v: unknown, choices: readonly string[]) => str(v) && choices.includes(v);
const nonEmpty = (v: unknown): v is string => str(v) && !!v.trim();
const validOptions = (v: unknown) => Array.isArray(v) && v.length >= 2 && v.length <= 4 &&
  new Set(v.map((o: unknown) => obj(o) ? o.id : null)).size === v.length &&
  v.every((o: unknown) => obj(o) && nonEmpty(o.id) && nonEmpty(o.label) && str(o.consequence) && str(o.feedback) && typeof o.isPreferred === "boolean") &&
  v.some((o: unknown) => obj(o) && o.isPreferred === true);
function validActivity(v: unknown): v is DidacticActivity {
  if (!obj(v) || !nonEmpty(v.instruction) || !str(v.expectedLearning) || !strings(v.assessmentCriteria) || !v.assessmentCriteria.length ||
    !strings(v.hints) || !v.hints.length || typeof v.minimumScore !== "number" || !Number.isFinite(v.minimumScore) ||
    v.minimumScore < 0 || v.minimumScore > 100 || typeof v.maxAttempts !== "number" || !Number.isInteger(v.maxAttempts) || v.maxAttempts < 1) return false;
  if (v.kind !== undefined && !oneOf(v.kind, ACTIVITY_TYPES)) return false;
  if (v.scenario !== undefined && !nullable(v.scenario)) return false;
  if (v.debrief !== undefined && !nullable(v.debrief)) return false;
  if (v.options !== undefined && (!Array.isArray(v.options) || !v.options.every((o: unknown) =>
    obj(o) && nonEmpty(o.id) && str(o.label) && str(o.consequence) && str(o.feedback) && typeof o.isPreferred === "boolean"))) return false;
  if ((v.kind === "decision" || v.kind === "quiz") && !validOptions(v.options)) return false;

if (v.kind === "sorting") {
  if (
    !Array.isArray(v.groups) ||
    !Array.isArray(v.sortItems)
  ) {
    return false;
  }

  const groups: unknown[] = v.groups;
  const sortItems: unknown[] = v.sortItems;

  if (
    groups.length < 2 ||
    groups.length > 4 ||
    sortItems.length < 2 ||
    sortItems.length > 8
  ) {
    return false;
  }

  if (
    !groups.every(
      (g) =>
        obj(g) &&
        nonEmpty(g.id) &&
        nonEmpty(g.label),
    ) ||
    !sortItems.every(
      (item) =>
        obj(item) &&
        nonEmpty(item.id) &&
        nonEmpty(item.label) &&
        str(item.feedback) &&
        typeof item.groupId === "string",
    )
  ) {
    return false;
  }

  const groupIds = groups.map(
    (g) => (g as { id: string }).id,
  );

  const itemIds = sortItems.map(
    (item) => (item as { id: string }).id,
  );

  if (
    new Set(groupIds).size !== groups.length ||
    new Set(itemIds).size !== sortItems.length
  ) {
    return false;
  }

  if (
    !sortItems.every((item) =>
      groupIds.includes(
        (item as { groupId: string }).groupId,
      ),
    )
  ) {
    return false;
  }
}

  return true;
}
export function validateDidacticScreen(v: unknown): v is DidacticScreen {
  if (!obj(v) || !nonEmpty(v.id) || !oneOf(v.phase, DIDACTIC_PHASES) || !oneOf(v.type, SCREEN_TYPES) ||
    !nonEmpty(v.title) || !nullable(v.subtitle) || !obj(v.visual) || !obj(v.teacher)) return false;
  if (!oneOf(v.visual.layout, LAYOUTS) || !Array.isArray(v.visual.items) || v.visual.items.length < 1 || v.visual.items.length > 6 ||
    !v.visual.items.every((i: unknown) => obj(i) && str(i.title) && str(i.description))) return false;
  if (!str(v.teacher.explanation) || !nullable(v.teacher.transition) || (v.activity !== null && !validActivity(v.activity))) return false;
  if (v.learningGoal !== undefined && !str(v.learningGoal)) return false;
  if (v.teachingStrategy !== undefined && !str(v.teachingStrategy)) return false;
  if (v.estimatedMinutes !== undefined && (typeof v.estimatedMinutes !== "number" || !Number.isFinite(v.estimatedMinutes) || v.estimatedMinutes <= 0)) return false;
  return true;
}
export function validateDidacticPackage(v: unknown): v is DidacticPackage {
  if (!obj(v) || v.version !== 1 || !str(v.lessonId) || !str(v.lessonTitle) || !str(v.objective) ||
    !str(v.generatedAt) || v.status !== "draft" || !Array.isArray(v.screens) || !Array.isArray(v.sources)) return false;
  if (v.screens.length < 5 || v.screens.length > 14 || !v.screens.every(validateDidacticScreen)) return false;
  const screens = v.screens as DidacticScreen[];
  if (new Set(screens.map(s => s.id)).size !== screens.length) return false;
  if (screens.some((s, i) => i > 0 && DIDACTIC_PHASES.indexOf(s.phase) < DIDACTIC_PHASES.indexOf(screens[i - 1].phase))) return false;
  if (!DIDACTIC_PHASES.every(p => screens.some(s => s.phase === p)) || !screens.some(s => s.phase === "assessment" && s.activity)) return false;
  if (!v.sources.every((s: unknown) => obj(s) && str(s.title) && nullable(s.author) && nullable(s.url) && str(s.relevance) && (s.verificationStatus === "pending" || s.verificationStatus === "verified"))) return false;
  if (v.pedagogicalApproach !== undefined && !str(v.pedagogicalApproach)) return false;
  if (v.prerequisites !== undefined && !strings(v.prerequisites)) return false;
  if (v.keyConcepts !== undefined && !strings(v.keyConcepts)) return false;
  return true;
}
