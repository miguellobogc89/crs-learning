/**
 * Conservative repair of missing or paraphrased link evidence.
 * Accept only a real source line containing a distinct textual anchor from
 * each endpoint. Never infer a relation from the two records alone.
 */
export function findPairEvidence(
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
  for (const line of source.split(/\r?\n/)) {
    const text = line.trim();
    if (text.length < 8 || text.length > 1200) continue;
    const a = left.find(value => text.includes(value));
    const b = right.find(value => text.includes(value) && value !== a);
    if (a && b) return text;
  }
  return null;
}
