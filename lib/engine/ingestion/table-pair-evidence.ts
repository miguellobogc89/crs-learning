/**
 * Evidence for simple two-line tabular relationships.
 * Only a directly adjacent heading and delimited row are considered.
 * The heading must name one endpoint and the row the other. Both lines
 * are copied verbatim as one contiguous source substring.
 * This is intentionally not a general-purpose table parser.
 */
export function findAdjacentTablePairEvidence(
  source: string,
  from: Record<string, unknown>,
  to: Record<string, unknown>,
): string | null {
  const anchors = (values: Record<string, unknown>) =>
    Object.values(values).filter((value): value is string =>
      typeof value === "string" && value.trim().length >= 4 &&
      value.trim().length <= 160).map(value => value.trim());
  const left = anchors(from);
  const right = anchors(to);
  if (!left.length || !right.length) return null;
  const lines = source.split(/\r?\n/);
  for (let index = 1; index < lines.length; index++) {
    const heading = lines[index - 1];
    const row = lines[index];
    if (!heading.trim() || !row.trim() ||
        heading.length > 300 || row.length > 1200 ||
        !/[|\t;]/.test(row)) continue;
    const leftInHeading = left.some(anchor => heading.includes(anchor));
    const rightInHeading = right.some(anchor => heading.includes(anchor));
    const leftInRow = left.some(anchor => row.includes(anchor));
    const rightInRow = right.some(anchor => row.includes(anchor));
    if ((leftInHeading && rightInRow && !rightInHeading) ||
        (rightInHeading && leftInRow && !leftInHeading)) {
      return heading + (source.includes(heading + "\r\n" + row) ? "\r\n" : "\n") + row;
    }
  }
  return null;
}
