// lib/knowledge/import/truncate-document.ts
const DEFAULT_MAX_CHARACTERS = 30_000;

export function truncateDocument(
  text: string,
  maxCharacters = DEFAULT_MAX_CHARACTERS,
) {
  const normalizedText = text.trim();

  if (
    normalizedText.length <= maxCharacters
  ) {
    return normalizedText;
  }

  const beginningLength = Math.floor(
    maxCharacters * 0.7,
  );

  const endingLength =
    maxCharacters - beginningLength;

  const beginning = normalizedText.slice(
    0,
    beginningLength,
  );

  const ending = normalizedText.slice(
    -endingLength,
  );

  return [
    beginning,
    "",
    "[...CONTENIDO INTERMEDIO OMITIDO...]",
    "",
    ending,
  ].join("\n");
}

export function splitIntoBatches<T>(
  items: T[],
  batchSize: number,
) {
  if (batchSize <= 0) {
    throw new Error(
      "El tamaño del lote debe ser mayor que cero",
    );
  }

  const batches: T[][] = [];

  for (
    let index = 0;
    index < items.length;
    index += batchSize
  ) {
    batches.push(
      items.slice(
        index,
        index + batchSize,
      ),
    );
  }

  return batches;
}