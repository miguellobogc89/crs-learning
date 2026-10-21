/**
 * Conservative, deterministic routing hint. This is NOT a final classification:
 * ambiguous documents must still be reviewed rather than silently discarded.
 * The extracted text is the only input; no model call is needed.
 */
export type ImportContentKind = "information" | "tables" | "mixed" | "undetermined";
export type ImportContentClassification = {
  kind: ImportContentKind;
  structuredLines: number;
  narrativeLines: number;
  confidence: "high" | "low";
};

export function classifyImportContent(text: string): ImportContentClassification {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  let structuredLines = 0;
  let narrativeLines = 0;
  for (const line of lines) {
    const delimited = /\t|\s\|\s|;/.test(line) &&
      line.split(/\t|\s\|\s|;/).filter(Boolean).length >= 2;
    const quantity = /(?:^|\s)\d+(?:[.,]\d+)?\s*(?:kg|g|mg|l|ml|cl|ud|uds|unidades|%)(?:\s|$)/i.test(line);
    const numbered = /\b\d+(?:[.,]\d+)?\s*(?:€|eur)\b/i.test(line);
    if (delimited || quantity || numbered) structuredLines++;
    else if (line.length >= 70 && /[.!?]$/.test(line)) narrativeLines++;
  }
  // Never infer a table-only route from one isolated number.
  const structured = structuredLines >= 3;
  const narrative = narrativeLines >= 3;
  const kind: ImportContentKind = structured && narrative ? "mixed"
    : structured && narrativeLines === 0 ? "tables"
    : narrative && structuredLines === 0 ? "information"
    : "undetermined";
  return { kind, structuredLines, narrativeLines,
    confidence: kind === "undetermined" ? "low" : "high" };
}
