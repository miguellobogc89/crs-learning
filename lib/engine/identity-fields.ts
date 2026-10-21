/**
 * Conservative, provider-independent identity key selection.
 * An identifier is evidence of identity only when the field explicitly
 * describes an identifier, a named object, or a compound set of references.
 * Never use price, amount, quantity or descriptive text as identity.
 */
export function selectIdentityFields(
  fields: readonly { key: string }[],
): string[] {
  const keys = new Set(fields.map(field => field.key));
  const explicit = ["external_id", "id_externo", "tax_id", "vat_number",
    "nif", "cif", "code", "codigo", "sku", "reference", "referencia"];
  for (const key of explicit) if (keys.has(key)) return [key];

  // A junction/line item can have a stable compound identity when its
  // schema contains two or more explicit object references. This is not
  // inferred from matching values, prices or arbitrary labels.
  const references = fields.map(field => field.key).filter(key =>
    /^(?!external_id$|id_externo$)[a-z][a-z0-9_]*_(?:id|code|sku)$/.test(key) &&
    !["created_by_id", "updated_by_id", "source_id", "document_id",
      "workspace_id", "user_id"].includes(key));
  if (references.length >= 2) return references.sort();

  const names = ["product_name", "nombre_producto", "business_name",
    "nombre_comercial", "name", "nombre", "title", "titulo"];
  for (const key of names) if (keys.has(key)) return [key];
  return [];
}
