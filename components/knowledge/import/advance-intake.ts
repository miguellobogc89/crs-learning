type Progress = { estado: string; fase?: string; error?: string | null; resultado?: unknown; referencias?: unknown };
type Step = { status: "processing" | "completed" | "error"; result: unknown; error: string | null };
export type IntakeView = { status: "processing" | "completed" | "error"; phase: string; result: unknown; error: string | null;
  /** Independent check of the reading. Its failure never hides the reading itself. */
  verification?: Step & { references?: unknown };
  /** Classification of the reading's parts. Its failure never hides the reading or its verification. */
  classification?: Step };
type Request = (url: string, method?: "POST") => Promise<Progress>;

const moduleOf = (value: unknown) => value && typeof value === "object" && "module" in value ? (value as { module: unknown }).module : null;

/** Advances one module that runs after the reading: start it when pending, never retry automatically on error. */
async function step(url: string, module: string, request: Request): Promise<Step & { references?: unknown }> {
  const check = await request(url);
  if (check.estado === "error") return { status: "error", result: null, error: check.error ?? "No se pudo completar esta fase", references: check.referencias ?? null };
  if (check.estado === "completed") {
    if (moduleOf(check.resultado) !== module) throw new Error(`Falta el resultado de ${module}`);
    return { status: "completed", result: check.resultado, error: null, references: check.referencias ?? null };
  }
  if (check.estado === "pending") await request(url, "POST");
  return { status: "processing", result: null, error: null };
}

/**
 * Base reading → classification → vision reading → verification. Each is a separate module with its own
 * endpoint and checkpoint; this only decides which one to advance next. Errors are shown, never retried here.
 */
export async function advanceIntake(id: string, request: Request): Promise<IntakeView> {
  const intake = await request(`/api/knowledge/intake/${id}`);
  if (intake.estado === "intake_error") return { status: "error", phase: intake.fase ?? "lectura", result: null, error: intake.error ?? "No se pudo procesar el documento" };
  const base = await step(`/api/knowledge/intake/${id}/base-reading`, "base_reading", request);
  if (base.status === "processing") return { status: "processing", phase: "lectura_base", result: null, error: null };
  if (base.status === "error") return { status: "error", phase: "lectura_base", result: null, error: `Lectura base: ${base.error}` };
  const classification = await step(`/api/knowledge/intake/${id}/classification`, "document_classifier", request);
  const classified = { status: classification.status, result: classification.result, error: classification.error };
  if (classification.status === "processing") return { status: "processing", phase: "clasificacion", result: null, error: null, classification: classified };
  if (intake.estado === "intake_pending") await request(`/api/knowledge/intake/${id}`, "POST");
  if (intake.estado !== "intake_completed") return { status: "processing", phase: "lectura", result: null, error: null, classification: classified };
  if (moduleOf(intake.resultado) !== "document_extractor") throw new Error("Falta el JSON del extractor");
  const reading = intake.resultado;
  const verification = await step(`/api/knowledge/intake/${id}/verification`, "reading_verifier", request);
  return { status: verification.status === "processing" ? "processing" : "completed", phase: verification.status === "processing" ? "verificacion" : "completado",
    result: reading, error: null, verification, classification: classified };
}
