import type { KnowledgeImportProposalProgress } from "./knowledge-import-api";

type StreamEvent<T> =
  | { type: "progress"; progress: KnowledgeImportProposalProgress }
  | { type: "completed"; result: T }
  | { type: "error"; error: string };

/** Shared NDJSON reader. A terminal result must not wait for the socket to close. */
export async function readImportStream<T>(response: Response, onProgress?: (progress: KnowledgeImportProposalProgress) => void): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? `No se ha podido iniciar el análisis (HTTP ${response.status})`);
  }
  if (!response.body) throw new Error("El servidor no ha iniciado el flujo de análisis");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  function parse(line: string): { completed: true; result: T } | null {
    if (!line.trim()) return null;
    const event = JSON.parse(line) as StreamEvent<T>;
    if (event.type === "progress") { onProgress?.(event.progress); return null; }
    if (event.type === "error") throw new Error(event.error);
    if (event.type === "completed") return { completed: true, result: event.result };
    throw new Error("El servidor devolvió un evento de análisis no válido");
  }
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const terminal = parse(line);
        if (terminal) return terminal.result;
      }
      if (done) break;
    }
    const terminal = parse(buffer);
    if (terminal) return terminal.result;
    throw new Error("El análisis terminó sin devolver un resultado. Puedes reintentarlo sin volver a subir los archivos.");
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
