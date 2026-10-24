export type EditableEngineField = {
  key: string; name: string; field_type: string; is_required: boolean;
  is_unique: boolean; configuration: unknown;
};
export function engineFieldReadOnly(field: EditableEngineField) {
  return field.is_unique || ["entity_reference", "record_reference"].includes(field.field_type);
}
export function parseEngineEditorChanges(original: Record<string, unknown>, changes: Record<string, string>, fields: EditableEngineField[]) {
  const values = { ...original };
  for (const [key, input] of Object.entries(changes)) {
    const field = fields.find(field => field.key === key);
    if (!field || engineFieldReadOnly(field)) throw new Error("Este campo no admite edición.");
    const value = input.trim();
    if (!value) { values[key] = field.field_type === "text" || field.field_type === "long_text" ? "" : null; continue; }
    switch (field.field_type) {
      case "integer":
        if (!/^-?\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error(`${field.name}: introduce un entero válido.`);
        values[key] = Number(value); break;
      case "decimal":
        if (!/^-?\d+(?:[.,]\d+)?$/.test(value)) throw new Error(`${field.name}: introduce un decimal válido.`);
        values[key] = value.replace(",", "."); break;
      case "boolean":
        if (!["true", "false"].includes(value)) throw new Error(`${field.name}: selecciona sí o no.`);
        values[key] = value === "true"; break;
      case "json":
        try { values[key] = JSON.parse(value); } catch { throw new Error(`${field.name}: JSON no válido.`); }
        break;
      default: values[key] = input;
    }
  }
  return values;
}
