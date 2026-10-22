/**
 * Auditable, deterministic map of the full selection. All references point to
 * the original extracted text; candidates are NOT verified business records.
 */
export type ImportMapSource = { id: string; file_name: string; extracted_text: string | null };
type Evidence = { fileId: string; line: number; text: string };
const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").replace(/[^a-z0-9]+/g, " ").trim();
const docWords = [
  { type: "factura", test: /\b(factura|n[úu]m(?:ero)?\.?\s*factura|base imponible|total factura)\b/i },
  { type: "contrato", test: /\b(contrato|arrendador|arrendatario|cl[áa]usulas)\b/i },
  { type: "procedimiento", test: /\b(procedimiento|instrucciones|paso\s+\d+)\b/i },
  { type: "presupuesto", test: /\b(presupuesto|oferta econ[óo]mica)\b/i },
] as const;
export function buildImportMap(importId: string, sources: ImportMapSource[]) {
  const documents: Array<{ id: string; fileId: string; fileName: string; typeHint: string; confidence: "hint"; startLine: number; endLine: number; evidence: Evidence[] }> = [];
  const tables: Array<{ id: string; documentId: string; fileId: string; startLine: number; endLine: number; rows: Array<{ line: number; cells: string[]; raw: string }> }> = [];
  const entities = new Map<string, { key: string; label: string; kind: "heading_candidate"; occurrences: Evidence[] }>();
  const files = sources.map(source => {
    const lines = (source.extracted_text ?? "").split(/\r?\n/);
    const evidences: Evidence[] = [];
    const sections: Array<{ start: number; type: string; evidence: Evidence }> = [];
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i].trim();
      if (!text) continue;
      const kind = docWords.find(rule => rule.test.test(text));
      if (kind && sections.length === 0) sections.push({ start: 1, type: kind.type, evidence: { fileId: source.id, line: i + 1, text: text.slice(0, 220) } });
      // A strong repeated document heading is a candidate boundary, not proof.
      if (/^(?:factura|contrato|presupuesto)\s*(?:n[ºo°.]|n[úu]mero|#|:|\d)/i.test(text) && i > 0 && i + 1 > (sections[sections.length - 1]?.start ?? 0) + 8) {
        sections.push({ start: i + 1, type: kind?.type ?? "indeterminado", evidence: { fileId: source.id, line: i + 1, text: text.slice(0, 220) } });
      }
      if (/^[A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ\s():.\-]{3,65}$/.test(text) && !/^\d/.test(text)) {
        const key = fold(text);
        if (key.length > 3 && !/^(tfno|telefono|cadiz|adiz)$/.test(key)) {
          const entity = entities.get(key) ?? { key, label: text, kind: "heading_candidate" as const, occurrences: [] };
          if (entity.occurrences.length < 30) entity.occurrences.push({ fileId: source.id, line: i + 1, text: text.slice(0, 220) });
          entities.set(key, entity);
        }
      }
      if (evidences.length < 12 && kind) evidences.push({ fileId: source.id, line: i + 1, text: text.slice(0, 220) });
    }
    if (!sections.length) sections.push({ start: 1, type: "indeterminado", evidence: { fileId: source.id, line: 1, text: lines.find(Boolean)?.slice(0, 220) ?? "" } });
    const fileDocs = sections.map((section, i) => {
      const endLine = (sections[i + 1]?.start ?? lines.length + 1) - 1;
      const id = source.id + ":doc:" + (i + 1);
      const document = { id, fileId: source.id, fileName: source.file_name, typeHint: section.type, confidence: "hint" as const, startLine: section.start, endLine, evidence: [section.evidence] };
      documents.push(document);
      const candidateRows: Array<{ line: number; cells: string[]; raw: string }> = [];
      const flush = () => {
        if (candidateRows.length >= 2) tables.push({ id: id + ":table:" + (tables.filter(t => t.documentId === id).length + 1), documentId: id, fileId: source.id, startLine: candidateRows[0].line, endLine: candidateRows[candidateRows.length - 1].line, rows: candidateRows.splice(0) });
        else candidateRows.length = 0;
      };
      for (let n = section.start - 1; n < endLine; n++) {
        const raw = lines[n]?.trim() ?? "";
        // Require at least two meaningful cells; do not mistake prose with semicolons for a table.
        const cells = raw.includes("\t") ? raw.split(/\t+/) : raw.split(/\s{2,}|\s+\|\s+/);
        if (cells.filter(cell => cell.trim()).length >= 2 && raw.length <= 240) candidateRows.push({ line: n + 1, cells: cells.map(cell => cell.trim()), raw });
        else flush();
      }
      flush();
      return id;
    });
    return { fileId: source.id, fileName: source.file_name, sourceChars: (source.extracted_text ?? "").length, lineCount: lines.length, documentIds: fileDocs, sourceStoredSeparately: true };
  });
  const entityCandidates = [...entities.values()].filter(entity => entity.occurrences.length > 0);
  const sharedEntities = entityCandidates.filter(entity => new Set(entity.occurrences.map(item => item.fileId)).size > 1);
  return {
    format: "crs-import-map", version: 2, importId, stage: "global_map", status: "preliminary",
    methodology: "deterministic candidates; no semantic verification or record insertion",
    files, documents, tables, entityCandidates,
    relations: sharedEntities.map(entity => ({
      type: "shared_heading_candidate", entityKey: entity.key,
      fileIds: [...new Set(entity.occurrences.map(item => item.fileId))],
      evidence: entity.occurrences, verified: false,
    })),
    uncertainties: [
      "Document boundaries and type hints are provisional.",
      "Table rows are layout candidates, not validated accounting records.",
      "Heading candidates are not verified organizations or business entities.",
    ],
    summary: { files: files.length, documentCandidates: documents.length, tableCandidates: tables.length, headingCandidates: entityCandidates.length, sharedHeadingCandidates: sharedEntities.length },
    writesPerformed: { engine: false, knowledge: false },
  };
}
