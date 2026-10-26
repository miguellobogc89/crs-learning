type Progress = { estado: string; fase?: string; error?: string | null; resultado?: unknown };
export type IntakeView = { status: "processing" | "completed" | "error"; phase: string; result: unknown; error: string | null };
export async function advanceIntake(id: string, request: (url: string, method?: "POST") => Promise<Progress>): Promise<IntakeView> {
  const intake = await request(`/api/knowledge/intake/${id}`);
  const phase = intake.fase ?? "lectura";
  if (intake.estado === "intake_error") return { status: "error", phase, result: null, error: intake.error ?? "No se pudo procesar el documento" };
  if (intake.estado === "intake_pending") await request(`/api/knowledge/intake/${id}`, "POST");
  if (intake.estado !== "intake_completed") return { status: "processing", phase, result: null, error: null };
  if (!intake.resultado || typeof intake.resultado !== "object" || !("module" in intake.resultado) || intake.resultado.module !== "document_extractor") throw new Error("Falta el JSON del extractor");
  return { status: "completed", phase: "lectura", result: intake.resultado, error: null };
}
