// lib/knowledge/intake/normalize-intake-text.ts

const DIACRITICS_REGEX = /[\u0300-\u036f]/g;
const NON_ALPHANUMERIC_REGEX = /[^a-z0-9áéíóúüñ]+/gi;
const MULTIPLE_SPACES_REGEX = /\s+/g;

const STOP_WORDS = new Set([
  "a",
  "al",
  "algo",
  "algun",
  "alguna",
  "algunas",
  "alguno",
  "algunos",
  "ante",
  "con",
  "contra",
  "de",
  "del",
  "desde",
  "documento",
  "el",
  "ella",
  "ellas",
  "ellos",
  "en",
  "entre",
  "es",
  "esta",
  "este",
  "estos",
  "la",
  "las",
  "lo",
  "los",
  "o",
  "para",
  "por",
  "que",
  "se",
  "sin",
  "sobre",
  "su",
  "sus",
  "un",
  "una",
  "unas",
  "uno",
  "unos",
  "y",
]);

export function normalizeIntakeText(
  value: string,
): string {
  return value
    .normalize("NFD")
    .replace(DIACRITICS_REGEX, "")
    .toLowerCase()
    .replace(NON_ALPHANUMERIC_REGEX, " ")
    .replace(MULTIPLE_SPACES_REGEX, " ")
    .trim();
}

export function tokenizeIntakeText(
  value: string,
): string[] {
  const normalized = normalizeIntakeText(value);

  if (!normalized) {
    return [];
  }

  return Array.from(
    new Set(
      normalized
        .split(" ")
        .map((token) => token.trim())
        .filter(
          (token) =>
            token.length >= 3 &&
            !STOP_WORDS.has(token),
        ),
    ),
  );
}

export function removeIntakeFileExtension(
  fileName: string,
): string {
  const lastDotIndex = fileName.lastIndexOf(".");

  if (lastDotIndex <= 0) {
    return fileName;
  }

  return fileName.slice(0, lastDotIndex);
}