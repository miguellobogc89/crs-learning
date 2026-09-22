import type { KnowledgeCatalogTable } from "@/lib/knowledge/knowledge-analysis.types";
import type { KnowledgeFileCanonicalAnalysis } from "@/lib/knowledge/file-analysis/types";

type SourceFile = {
  id: string;
  fileName: string;
  fileType?: string | null;
  extractedText: string;
  canonicalAnalysis?: KnowledgeFileCanonicalAnalysis | null;
};

type RawCatalogTable = KnowledgeCatalogTable;

function normalizeCell(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeKey(value: string) {
  return normalizeCell(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function splitPipeRow(line: string) {
  return line.split("|").map(normalizeCell);
}

function isSheetHeading(line: string) {
  return /^#\s*Hoja:\s*/i.test(line.trim());
}

function getSheetName(line: string) {
  return line.replace(/^#\s*Hoja:\s*/i, "").trim();
}

function isLikelyTableRow(line: string) {
  return line.includes("|");
}

function hasMeaningfulCells(cells: string[]) {
  return cells.some((cell) => cell.length > 0);
}

function normalizeRowWidth(row: string[], width: number) {
  if (row.length === width) {
    return row;
  }

  if (row.length > width) {
    return row.slice(0, width);
  }

  return [
    ...row,
    ...Array.from({ length: width - row.length }, () => ""),
  ];
}

function buildTableFromRows({
  source,
  sheetName,
  rows,
}: {
  source: SourceFile;
  sheetName: string;
  rows: string[][];
}): RawCatalogTable | null {
  const normalizedRows = rows.filter(hasMeaningfulCells);

  if (normalizedRows.length < 2) {
    return null;
  }

  const headerIndex = normalizedRows.findIndex(
    (row) => row.filter(Boolean).length >= 2,
  );

  if (headerIndex < 0) {
    return null;
  }

  const columns = normalizedRows[headerIndex].map((cell, index) =>
    cell || `Columna ${index + 1}`,
  );

  const dataRows = normalizedRows
    .slice(headerIndex + 1)
    .map((row) => normalizeRowWidth(row, columns.length))
    .filter(hasMeaningfulCells);

  if (dataRows.length === 0) {
    return null;
  }

  return {
    title: sheetName || source.fileName,
    description: `Tabla extraida de ${source.fileName}.`,
    sourceDocumentId: source.id,
    sourceDocumentName: source.fileName,
    columns,
    rows: dataRows,
  };
}

function extractPipeTables(source: SourceFile) {
  const tables: RawCatalogTable[] = [];
  const lines = source.extractedText.split(/\r?\n/);

  let currentSheet = "";
  let currentRows: string[][] = [];

  function flush() {
    const table = buildTableFromRows({
      source,
      sheetName: currentSheet,
      rows: currentRows,
    });

    if (table) {
      tables.push(table);
    }

    currentRows = [];
  }

  for (const line of lines) {
    if (isSheetHeading(line)) {
      flush();
      currentSheet = getSheetName(line);
      continue;
    }

    if (isLikelyTableRow(line)) {
      currentRows.push(splitPipeRow(line));
      continue;
    }

    if (line.trim().length === 0) {
      flush();
    }
  }

  flush();

  return tables;
}

function extractCanonicalTables(source: SourceFile) {
  const tables: RawCatalogTable[] = [];
  const pages = source.canonicalAnalysis?.visualModel.pages ?? [];

  for (const page of pages) {
    for (const element of page.elements) {
      if (!element.table) {
        continue;
      }

      const rows = element.table.rows.map((row) =>
        row.cells.map((cell) => normalizeCell(cell.text ?? "")),
      );

      const table = buildTableFromRows({
        source,
        sheetName:
          element.name ||
          `Pagina ${page.pageNumber}`,
        rows,
      });

      if (table) {
        tables.push(table);
      }
    }
  }

  return tables;
}

function getTableSignature(table: RawCatalogTable) {
  return [
    normalizeKey(table.sourceDocumentName),
    normalizeKey(table.title),
    table.columns.map(normalizeKey).join("|"),
  ].join("::");
}

function mergeDuplicateTables(tables: RawCatalogTable[]) {
  const bySignature = new Map<string, RawCatalogTable>();

  for (const table of tables) {
    const signature = getTableSignature(table);
    const existing = bySignature.get(signature);

    if (!existing) {
      bySignature.set(signature, table);
      continue;
    }

    const rowKeys = new Set(
      existing.rows.map((row) => row.map(normalizeKey).join("|")),
    );

    const mergedRows = [...existing.rows];

    for (const row of table.rows) {
      const rowKey = row.map(normalizeKey).join("|");

      if (!rowKeys.has(rowKey)) {
        rowKeys.add(rowKey);
        mergedRows.push(row);
      }
    }

    bySignature.set(signature, {
      ...existing,
      rows: mergedRows,
    });
  }

  return Array.from(bySignature.values());
}

function tableCompletenessScore(table: RawCatalogTable) {
  return table.columns.length * Math.max(1, table.rows.length);
}

export function extractStructuredCatalogTables(
  files: SourceFile[],
) {
  const tables = files.flatMap((file) => [
    ...extractPipeTables(file),
    ...extractCanonicalTables(file),
  ]);

  return mergeDuplicateTables(tables)
    .filter(
      (table) =>
        table.columns.length >= 2 &&
        table.rows.length > 0,
    )
    .sort(
      (left, right) =>
        tableCompletenessScore(right) -
        tableCompletenessScore(left),
    );
}

export function mergeCatalogTables(
  generatedTables: KnowledgeCatalogTable[],
  extractedTables: KnowledgeCatalogTable[],
) {
  if (extractedTables.length === 0) {
    return generatedTables;
  }

  const merged = [...extractedTables];
  const extractedSignatures = new Set(
    extractedTables.map(getTableSignature),
  );
  const extractedSourceIds = new Set(
    extractedTables.map((table) => table.sourceDocumentId),
  );

  for (const generated of generatedTables) {
    const signature = getTableSignature(generated);

    if (!generated.sourceDocumentId) {
      continue;
    }

    if (extractedSourceIds.has(generated.sourceDocumentId)) {
      continue;
    }

    if (extractedSignatures.has(signature)) {
      continue;
    }

    const overlapsExtracted = extractedTables.some(
      (table) =>
        table.sourceDocumentId === generated.sourceDocumentId &&
        table.columns.map(normalizeKey).join("|") ===
          generated.columns.map(normalizeKey).join("|"),
    );

    if (!overlapsExtracted) {
      merged.push(generated);
    }
  }

  return mergeDuplicateTables(merged);
}
