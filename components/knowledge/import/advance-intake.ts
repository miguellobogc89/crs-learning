type Progress = { estado: string; fase?: string; error?: string | null; resultado?: unknown; referencias?: unknown };
export type IntakeView = { status: "processing" | "completed" | "error"; phase: string; result: unknown; error: string | null;
  /** Independent check of the reading. Its failure never hides the reading itself. */
  verification?: { status: "processing" | "completed" | "error"; result: unknown; error: string | null; references?: unknown } };
export async function advanceIntake(id: string, request: (url: string, method?: "POST") => Promise<Progress>): Promise<IntakeView> {
  const intake = await request(`/api/knowledge/intake/${id}`);
  const phase = intake.fase ?? "lectura";
  if (intake.estado === "intake_error") return { status: "error", phase, result: null, error: intake.error ?? "No se pudo procesar el documento" };
  if (intake.estado === "intake_pending") await request(`/api/knowledge/intake/${id}`, "POST");
  if (intake.estado !== "intake_completed") return { status: "processing", phase, result: null, error: null };
  if (!intake.resultado || typeof intake.resultado !== "object" || !("module" in intake.resultado) || intake.resultado.module !== "document_extractor") throw new Error("Falta el JSON del extractor");
  const reading = intake.resultado;
  const url = `/api/knowledge/intake/${id}/verification`;
  const check = await request(url);
  if (check.estado === "error") return { status: "completed", phase: "verificacion", result: reading, error: null,
    verification: { status: "error", result: null, error: check.error ?? "No se pudo verificar la lectura", references: check.referencias ?? null } };
  if (check.estado === "completed") {
    if (!check.resultado || typeof check.resultado !== "object" || !("module" in check.resultado) || check.resultado.module !== "reading_verifier") throw new Error("Falta el informe de verificación");
    return { status: "completed", phase: "verificacion", result: reading, error: null, verification: { status: "completed", result: check.resultado, error: null, references: check.referencias ?? null } };
  }
  if (check.estado === "pending") await request(url, "POST");
  return { status: "processing", phase: "verificacion", result: reading, error: null, verification: { status: "processing", result: null, error: null } };
}
