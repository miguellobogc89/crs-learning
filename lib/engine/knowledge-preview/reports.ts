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

/** One plain-text document for both the visible summary and the clipboard. */
export function importSummary(input: {
  inventory?: ImportInventory | null;
  proposal?: import("@/lib/knowledge/import/types").KnowledgeImportProposal | null;
  preview?: KnowledgeEnginePreview | null;
  completion?: import("@/lib/knowledge/import/types").ConfirmKnowledgeImportResult | null;
  files?: Array<{name:string;status:string;error?:string}>;
  message?: string | null;
  error?: string | null;
  notice?: string | null;
  engineMessage?: string | null;
  engineError?: string | null;
  engineSeconds?: number;
}): string {
  const proposal=input.proposal ?? input.completion?.log.proposalSnapshot;
  const inventory=input.inventory ?? proposal?.globalImportMap;
  const parts=["RESUMEN COMPLETO DE LA IMPORTACIÓN",
    input.completion ? "Estado: guardado en Knowledge. Engine conserva solo una vista previa."
      : "Estado: análisis y propuesta. Todavía no se ha confirmado la importación.",
    ...[input.message,input.notice,input.error ? "Error de importación: "+input.error : null].filter((text):text is string=>!!text),
  ];
  const reports=inventory ? sourceReports(inventory) : [{
    title:"1 · Preparación y reconocimiento",status:input.error ? "Revisar" : "En curso",input:`${input.files?.length??0} archivos seleccionados.`,
    validation:"Se conserva el texto y la procedencia de cada archivo.",
    text:input.files?.map(file=>`${file.name}: ${file.status}${file.error ? " · "+file.error : ""}`).join("\n") || "Esperando los documentos.",
  }];
  const phases=[...reports,...(input.preview ? engineReports(input.preview) : [])];
  if(input.preview?.status==="not_applicable"){
    phases.splice(reports.length,phases.length-reports.length,{
      title:"3 · Engine sin candidatos",status:"Validado",input:"Destinos de la revisión conjunta.",
      validation:"Ningún segmento requiere extracción estructurada.",text:"No se ejecuta extracción en Engine. Los documentos y artículos se proponen para Knowledge.",
    });
  }
  parts.push(...phases.map(report=>`${report.title} · ${report.status}\nEntrada: ${report.input}\nValidación: ${report.validation}\n\n${report.text}`));
  if(inventory?.batchReview?.groups.length)parts.push("GRUPOS DEL LOTE\n"+inventory.batchReview.groups.map(group=>`${group.title} · ${group.documentIds.length} documentos\n${group.reason}`).join("\n\n"));
  if(input.engineMessage)parts.push(`Estado actual de Engine: ${input.engineMessage}${input.engineSeconds ? ` · ${input.engineSeconds} s` : ""}`);
  if(input.engineError)parts.push("Error de Engine: "+input.engineError);
  if(proposal){
    const names=new Map((inventory?.files??[]).map(file=>[file.fileId,file.fileName]));
    parts.push("PROPUESTA DE KNOWLEDGE\n"+proposal.title+"\n"+proposal.description,
      `Documentos: ${proposal.summary.totalDocuments}. Carpetas propuestas: ${proposal.folders.length}. Artículos nuevos: ${proposal.articles.filter(a=>a.action==="create").length}. Actualizaciones: ${proposal.articles.filter(a=>a.action==="update").length}.`,
      ...proposal.folders.map(folder=>`Carpeta: ${folder.name}\n${folder.description}`),
      ...proposal.articles.map(article=>`${article.action==="create"?"Artículo nuevo":"Actualizar artículo"}: ${article.title}\n${article.description}\nFuentes: ${article.documentIds.map(id=>names.get(id)??id).join(", ")}`),
      ...proposal.warnings.map(warning=>`Aviso: ${warning.title}\n${warning.description}`),
    );
  }
  if(input.completion){
    const log=input.completion.log;
    parts.push("RESULTADO DEL GUARDADO",
      `Knowledge: ${log.summary.documentsCreated} documentos guardados, ${log.summary.documentsSkippedAsDuplicates} duplicados reutilizados, ${log.summary.articlesCreated} artículos nuevos, ${log.summary.articlesUpdated} actualizaciones y ${log.summary.foldersCreated} carpetas nuevas.`,
      ...log.documents.map(file=>`Documento guardado: ${file.fileName}`),
      ...log.skippedDocuments.map(file=>`Documento reutilizado: ${file.fileName}`),
    );
  }
  parts.push("Engine: el guardado de registros no está implementado y validado en este flujo. La acción final importa solo en Knowledge.");
  return parts.filter(Boolean).join("\n\n");
}
