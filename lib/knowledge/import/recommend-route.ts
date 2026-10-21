import type { ImportContentClassification } from "./classify-content";

export type ImportDestination = "knowledge" | "engine" | "both" | "review";
export type ImportRoute = {
  destination: ImportDestination;
  reason: string;
  confidence: "high" | "low";
};

/**
 * Pure routing recommendation. Never persists data or drops documents.
 * Uncertain cases are reviewed instead of being silently routed.
 */
export function recommendImportRoute(
  classification: ImportContentClassification,
): ImportRoute {
  switch (classification.kind) {
    case "information":
      return { destination: "knowledge", confidence: classification.confidence,
        reason: "Contenido narrativo destinado a Knowledge." };
    case "tables":
      return { destination: "engine", confidence: classification.confidence,
        reason: "Datos estructurados destinados a Engine, sin artículo narrativo." };
    case "mixed":
      return { destination: "both", confidence: classification.confidence,
        reason: "Contiene información narrativa y datos estructurados." };
    default:
      return { destination: "review", confidence: "low",
        reason: "La clasificación no es suficientemente fiable para decidir automáticamente." };
  }
}
