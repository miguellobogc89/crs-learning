import type { IntakeResult } from "@/lib/knowledge/intake/structures/contract";
type Progress = { estado: string; fase?: string; error?: string | null; resultado?: unknown };
export type IntakeView = { status: "processing" | "completed" | "error"; phase: string; result: unknown; error: string | null };
export async function advanceIntake(id: string, request: (url: string, method?: "POST") => Promise<Progress>): Promise<IntakeView> {
  const intake = await request(`/api/knowledge/intake/${id}`);
  const phase = intake.fase ?? "lectura";
  if (intake.estado === "intake_error") return { status: "error", phase, result: null, error: intake.error ?? "No se pudo procesar el documento" };
  if (intake.estado === "intake_pending") await request(`/api/knowledge/intake/${id}`, "POST");
  if (intake.estado !== "intake_completed") return { status: "processing", phase, result: null, error: null };
  const classification = intake.resultado as IntakeResult | undefined;
  if (!classification?.unidades) throw new Error("Falta el resultado de clasificación");
  if (!classification.unidades.some(u => u.destino === "engine" || u.destino === "hibrido")) {
    return { status: "completed", phase: "clasificacion", result: classification, error: null };
  }
  const structure = await request(`/api/knowledge/intake/${id}/structures`);
  if (structure.estado === "error") return { status: "error", phase: "estructuras", result: null, error: structure.error ?? "No se pudo descubrir la estructura" };
  if (structure.estado === "completed") return { status: "completed", phase: "estructuras", result: structure.resultado, error: null };
  if (structure.estado === "pending") await request(`/api/knowledge/intake/${id}/structures`, "POST");
  return { status: "processing", phase: "estructuras", result: null, error: null };
}
