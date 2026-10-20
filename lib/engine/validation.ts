/**
 * CRS Data Engine — validation of configurable record values.
 *
 * This module is intentionally independent from Prisma and HTTP handlers.
 * Persisting a record must additionally verify organization ownership,
 * object type status, and permissions in the service layer.
 */
export type EngineFieldType =
  | "text" | "long_text" | "integer" | "decimal" | "boolean"
  | "date" | "datetime" | "enum" | "entity_reference"
  | "record_reference" | "json";

export type EngineFieldDefinition = {
  key: string;
  field_type: string;
  is_required: boolean;
  status: string;
  configuration?: unknown;
};

export type EngineValidationIssue = {
  field: string;
  code: "unknown_field" | "required" | "invalid_type" | "invalid_option" | "unsupported_type";
  message: string;
};

export type EngineValidationResult =
  | { ok: true; values: Record<string, unknown> }
  | { ok: false; issues: EngineValidationIssue[] };

const SUPPORTED_FIELD_TYPES: ReadonlySet<string> = new Set<EngineFieldType>([
  "text", "long_text", "integer", "decimal", "boolean", "date",
  "datetime", "enum", "entity_reference", "record_reference", "json",
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validType(field: EngineFieldDefinition, value: unknown): boolean {
  switch (field.field_type) {
    case "text":
    case "long_text":
      return typeof value === "string";
    case "integer":
      return typeof value === "number" && Number.isSafeInteger(value);
    case "decimal":
      // Decimal amounts may arrive as strings to avoid JS floating-point rounding.
      return (typeof value === "number" && Number.isFinite(value)) ||
        (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value));
    case "boolean":
      return typeof value === "boolean";
    case "date":
      return typeof value === "string" && validDate(value);
    case "datetime":
      return typeof value === "string" && !Number.isNaN(Date.parse(value)) &&
        /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
    case "enum":
      return typeof value === "string";
    case "entity_reference":
    case "record_reference":
      return typeof value === "string" && UUID.test(value);
    case "json":
      return value !== undefined;
    default:
      return false;
  }
}

/** Validates full record snapshots, not partial PATCH payloads. */
export function validateEngineRecordValues(
  input: unknown,
  fields: readonly EngineFieldDefinition[],
): EngineValidationResult {
  if (!isObject(input)) {
    return { ok: false, issues: [{ field: "$", code: "invalid_type", message: "Values must be a JSON object." }] };
  }

  const activeFields = new Map(fields.filter((f) => f.status === "active").map((f) => [f.key, f]));
  const issues: EngineValidationIssue[] = [];

  for (const key of Object.keys(input)) {
    if (!activeFields.has(key)) {
      issues.push({ field: key, code: "unknown_field", message: "Field is not defined or active." });
    }
  }

  for (const field of activeFields.values()) {
    if (!SUPPORTED_FIELD_TYPES.has(field.field_type)) {
      issues.push({ field: field.key, code: "unsupported_type", message: "Unsupported field type." });
      continue;
    }
    const value = input[field.key];
    if (value === undefined || value === null || value === "") {
      if (field.is_required) {
        issues.push({ field: field.key, code: "required", message: "A value is required." });
      }
      continue;
    }
    if (!validType(field, value)) {
      issues.push({ field: field.key, code: "invalid_type", message: `Expected ${field.field_type}.` });
      continue;
    }
    if (field.field_type === "enum" && isObject(field.configuration)) {
      const options = field.configuration.options;
      if (Array.isArray(options) && !options.includes(value)) {
        issues.push({ field: field.key, code: "invalid_option", message: "Value is not an allowed option." });
      }
    }
  }

  return issues.length ? { ok: false, issues } : { ok: true, values: input };
}
