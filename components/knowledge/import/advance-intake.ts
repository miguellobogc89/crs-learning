type Progress = { estado: string; fase?: string; error?: string | null; resultado?: unknown; referencias?: unknown; plan?: unknown };
type Step = { status: "processing" | "waiting" | "completed" | "error"; result: unknown; error: string | null };
/**
 * `waiting`: step-by-step mode only. The next module (`phase`) is ready to start and waits for the person to
 * continue; everything finished before it is in the view.
 */
export type IntakeView = { status: "processing" | "waiting" | "completed" | "error"; phase: string; result: unknown; error: string | null;
  /** Independent check of the reading. Its failure never hides the reading itself. */
  verification?: Step & { references?: unknown };
  /** Classification of the reading's parts. Its failure never hides the reading or its verification. */
  classification?: Step;
  /** Which extracted entities already exist in the workspace (targeted extractions only; read-only). */
  reconciliation?: Step;
  /** Saving records: the plan to review (always waits for the person) or the saved result. */
  writing?: { status: "waiting" | "completed"; result: unknown; plan: unknown; error: string | null } };
type Request = (url: string, method?: "POST") => Promise<Progress>;
/** `start: false` (step-by-step mode) never starts a module: it stops at the next pending one as `waiting`. */
/** `retry`: only from an explicit "Continuar" of the person — resumes a reading that stopped with an error (the files
 *  already read are kept; it goes on with the next one). Never set by the automatic polling. */
export type AdvanceOptions = { start?: boolean; retry?: boolean };

export const PHASE_NAMES: Record<string, string> = {
  lectura_base: "Lectura base", clasificacion: "Clasificación", lectura: "Extracción", verificacion: "Revisión de valores", conciliacion: "Conciliación",
  escritura: "Guardar en mis datos",
};

const moduleOf = (value: unknown) => value && typeof value === "object" && "module" in value ? (value as { module: unknown }).module : null;

/** Advances one module that runs after the reading: start it when pending, never retry automatically on error. */
async function step(url: string, module: string, request: Request, start: boolean): Promise<Step & { references?: unknown }> {
  const check = await request(url);
  if (check.estado === "error") return { status: "error", result: null, error: check.error ?? "No se pudo completar esta fase", references: check.referencias ?? null };
  if (check.estado === "completed") {
    if (moduleOf(check.resultado) !== module) throw new Error(`Falta el resultado de ${module}`);
    return { status: "completed", result: check.resultado, error: null, references: check.referencias ?? null };
  }
  if (check.estado === "pending") {
    if (!start) return { status: "waiting", result: null, error: null };
    await request(url, "POST");
  }
  return { status: "processing", result: null, error: null };
}

const pause = (s: Step["status"]) => s === "processing" || s === "waiting";

/**
 * Base reading → classification → vision reading → verification → reconciliation (targeted extractions). Each is
 * a separate module with its own endpoint and checkpoint; this only decides which one to advance next. Errors are
 * shown, never retried here. In step-by-step mode (`start: false`) nothing is started: the view stops at the
 * next pending module, so a stored batch can be resumed one module at a time without uploading it again.
 */
export async function advanceIntake(id: string, request: Request, { start = true, retry = false }: AdvanceOptions = {}): Promise<IntakeView> {
  const intake = await request(`/api/knowledge/intake/${id}`);
  if (intake.estado === "intake_error") {
    if (!retry) return { status: "error", phase: intake.fase ?? "lectura", result: null, error: intake.error ?? "No se pudo procesar el documento" };
    await request(`/api/knowledge/intake/${id}`, "POST");
    return { status: "processing", phase: "lectura", result: null, error: null };
  }
  const base = await step(`/api/knowledge/intake/${id}/base-reading`, "base_reading", request, start);
  if (pause(base.status)) return { status: base.status as "processing" | "waiting", phase: "lectura_base", result: null, error: null };
  if (base.status === "error") return { status: "error", phase: "lectura_base", result: null, error: `Lectura base: ${base.error}` };
  const classification = await step(`/api/knowledge/intake/${id}/classification`, "document_classifier", request, start);
  const classified = { status: classification.status, result: classification.result, error: classification.error };
  if (pause(classification.status)) return { status: classification.status as "processing" | "waiting", phase: "clasificacion", result: null, error: null, classification: classified };
  if (intake.estado === "intake_pending") {
    if (!start) return { status: "waiting", phase: "lectura", result: null, error: null, classification: classified };
    await request(`/api/knowledge/intake/${id}`, "POST");
  }
  if (intake.estado !== "intake_completed") return { status: "processing", phase: "lectura", result: null, error: null, classification: classified };
  const extractionModule = moduleOf(intake.resultado);
  if (extractionModule !== "document_extractor" && extractionModule !== "targeted_extraction") throw new Error("Falta el JSON del extractor");
  const reading = intake.resultado;
  const verification = await step(`/api/knowledge/intake/${id}/verification`, "reading_verifier", request, start);
  if (pause(verification.status)) return { status: verification.status as "processing" | "waiting", phase: "verificacion", result: reading, error: null, verification, classification: classified };
  // Reconciliation runs after the verification has written its checkpoint, so the two never write the batch at once.
  if (extractionModule !== "targeted_extraction") return { status: "completed", phase: "completado", result: reading, error: null, verification, classification: classified };
  const reconciled = await step(`/api/knowledge/intake/${id}/reconciliation`, "reconciliation", request, start);
  const reconciliation = { status: reconciled.status, result: reconciled.result, error: reconciled.error };
  const base_ = { result: reading, error: null, verification, classification: classified, reconciliation };
  if (pause(reconciled.status)) return { ...base_, status: reconciled.status as "processing" | "waiting", phase: "conciliacion" };
  if (reconciled.status === "error") return { ...base_, status: "completed", phase: "completado" };
  // Writing records is never started automatically: the plan is shown and the person saves it (with decisions).
  const writing = await request(`/api/knowledge/intake/${id}/writing`);
  if (writing.estado === "completed") return { ...base_, status: "completed", phase: "completado", writing: { status: "completed", result: writing.resultado ?? null, plan: null, error: null } };
  if (writing.estado === "blocked") return { ...base_, status: "completed", phase: "completado" };
  return { ...base_, status: "waiting", phase: "escritura", writing: { status: "waiting", result: null, plan: writing.plan ?? null, error: writing.error ?? null } };
}
