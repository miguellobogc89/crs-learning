import type { KnowledgeEnginePreview } from "./types";
import type { ImportInventory } from "@/lib/knowledge/import/build-import-map";
import type { ImportPhaseReportData } from "@/components/knowledge/import/modal/import-phase-report";

export function sourceReports(inventory: ImportInventory): ImportPhaseReportData[] {
  const reviewed = inventory.batchReview?.status === "reviewed";
  return [{
    title: "1 · Preparación y reconocimiento", status: inventory.status === "in_progress" ? "En curso" : inventory.files.some(file => file.status === "error") ? "Revisar" : "Validado",
    input: `${inventory.files.length} archivos con texto extraído.`,
    validation: "Texto y límites de segmentos conservados por archivo; los errores se muestran individualmente.",
    text: inventory.files.map(file => `${file.fileName}: ${file.status === "completed" ? `${file.sourceChars} caracteres; ${file.documentIds.length} segmentos` : file.error ?? "Error"}`).join("\n"),
  }, {
    title: "2 · Revisión conjunta y destinos", status: reviewed ? "Validado" : "Pendiente",
    input: `${inventory.documents.length} segmentos del lote.`,
    validation: "Revisión conjunta vinculada al contenido de las fuentes; los destinos se deciden por segmento.",
    text: inventory.documents.map(document => `${document.fileName} · ${document.title} · líneas ${document.startLine}–${document.endLine}\n${document.routing ? [document.routing.articleCandidate ? "Knowledge: artículo" : "Knowledge: fuente de consulta", document.routing.structuredCandidate ? "Engine: candidato" : "Engine: sin extracción", document.routing.reason].join(" · ") : "Destino pendiente de revisión"}`).join("\n\n"),
  }];
}

export function engineReports(preview: KnowledgeEnginePreview): ImportPhaseReportData[] {
  const schema = preview.schema;
  const entityName = (key: string) => schema?.entities.find(entity => entity.key === key)?.name ?? key;
  const finished = preview.documents.every(document => document.status !== "pending");
  const statusName = { pending: "Pendiente", verified: "Verificado", needs_review: "Requiere revisión", failed: "Fallido" };
  const timing = (stage: "schema" | "extract") => preview.calls.filter(call => call.stage === stage).map(call =>
    `${stage === "schema" ? "Esquema del lote" : preview.documents.find(document => document.segmentId === call.segmentId)?.fileName ?? call.segmentId}: ${(call.durationMs / 1000).toFixed(1)} s; entrada ${call.inputTokens ?? "sin datos"} tokens; salida ${call.outputTokens ?? "sin datos"} tokens${call.error ? `; ${call.error}` : ""}`);
  return [{
    title: "3 · Esquema común", status: schema ? "Validado" : preview.status === "schema_failed" ? "Revisar" : preview.status === "running" ? "En curso" : "Pendiente",
    input: `${preview.documents.length} segmentos estructurados y catálogo existente.`,
    validation: "Tipos, referencias e identidad declarada por entidad. El respaldo de campos se comprueba tras extraer.",
    text: schema ? [...schema.entities.map(entity => `${entity.name}: ${entity.fields.map(field => `${field.name} (${field.type})`).join(", ")}\nIdentidad: ${entity.identityFields.join(" + ")}${entity.ownedBy || entity.identityScope ? `; alcance: ${entity.ownedBy ?? entity.identityScope}` : ""}`), ...schema.relations.map(relation => `${relation.name}: ${entityName(relation.fromEntity)} → ${entityName(relation.toEntity)} (${relation.cardinality})`), ...schema.warnings, ...timing("schema")].join("\n\n") : [preview.schemaError, ...preview.schemaIssues.map(issue => issue.message), ...timing("schema")].filter(Boolean).join("\n") || "Esperando el esquema del lote.",
  }, {
    title: "4 · Extracción y evidencia", status: !schema ? "Pendiente" : !finished ? "En curso" : preview.documents.every(document => document.status === "verified") ? "Validado" : "Revisar",
    input: "Esquema común y líneas numeradas de cada segmento.",
    validation: "Cada valor debe superar tipo y cita en su propio segmento. Una cita no demuestra por sí sola su rol semántico.",
    text: [...preview.documents.map(document => `${document.fileName} · ${document.title} · ${statusName[document.status]}\n${document.records.map(record => `${entityName(record.entity)} ${record.ref}: ${Object.entries(record.values).map(([key, value]) => `${schema?.entities.find(entity => entity.key === record.entity)?.fields.find(field => field.key === key)?.name ?? key} = ${value.value} [L${value.evidence.lineStart} «${value.evidence.text}»]`).join("; ")}`).join("\n")}\n${document.links.map(link => `${schema?.relations.find(relation => relation.key === link.relation)?.name ?? link.relation}: ${link.from} → ${link.to}`).join("\n")}\n${[document.error, ...document.issues.map(issue => issue.message), ...document.warnings].filter(Boolean).join("\n")}`), ...timing("extract")].join("\n\n"),
  }, {
    title: "5 · Conciliación y validación del lote", status: preview.status === "ready" ? "Validado" : preview.status === "needs_review" ? "Revisar" : "Pendiente",
    input: "Registros y relaciones con evidencia; identidad y alcance del esquema.",
    validation: "Identidades completas y conflictos visibles. La vista previa no guarda registros ni publica estándares.",
    text: [...preview.clusters.map(cluster => `${entityName(cluster.entity)}: ${cluster.label} · ${Object.values(cluster.identity).join(" + ")} · ${cluster.occurrences.length} apariciones${cluster.unresolved ? " · identidad sin resolver" : ""}\n${cluster.occurrences.map(occurrence => `${occurrence.fileName}${occurrence.roles.length ? ` (${occurrence.roles.join(", ")})` : ""}`).join("; ")}${cluster.conflicts.map(conflict => `\nConflicto ${conflict.field}: ${conflict.values.map(item => `${item.value} (${item.fileName})`).join(" / ")}`).join("")}`), ...preview.labelIssues.map(issue => issue.message), preview.support ? `Sin respaldo: ${[...preview.support.unsupported.entities, ...preview.support.unsupported.fields, ...preview.support.unsupported.relations].join(", ") || "ninguno"}` : "Respaldo pendiente.", `Telemetría Engine: ${preview.totals.calls} llamadas; ${(preview.totals.durationMs / 1000).toFixed(1)} s acumulados de llamadas; ${preview.totals.inputTokens} tokens de entrada; ${preview.totals.outputTokens} de salida.`, "Guardado en Engine bloqueado: todavía no está implementado y validado en este flujo."].join("\n\n"),
  }];
}
