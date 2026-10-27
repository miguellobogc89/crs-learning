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

/** Reading → verification → classification, each a separate module with its own endpoint and checkpoint. */
export async function advanceIntake(id: string, request: Request): Promise<IntakeView> {
  const intake = await request(`/api/knowledge/intake/${id}`);
  const phase = intake.fase ?? "lectura";
  if (intake.estado === "intake_error") return { status: "error", phase, result: null, error: intake.error ?? "No se pudo procesar el documento" };
  if (intake.estado === "intake_pending") await request(`/api/knowledge/intake/${id}`, "POST");
  if (intake.estado !== "intake_completed") return { status: "processing", phase, result: null, error: null };
  if (moduleOf(intake.resultado) !== "document_extractor") throw new Error("Falta el JSON del extractor");
  const reading = intake.resultado;
  const verification = await step(`/api/knowledge/intake/${id}/verification`, "reading_verifier", request);
  if (verification.status === "processing") return { status: "processing", phase: "verificacion", result: reading, error: null, verification };
  const classification = await step(`/api/knowledge/intake/${id}/classification`, "document_classifier", request);
  return { status: classification.status === "processing" ? "processing" : "completed", phase: classification.status === "processing" ? "clasificacion" : "completado",
    result: reading, error: null, verification, classification: { status: classification.status, result: classification.result, error: classification.error } };
}
