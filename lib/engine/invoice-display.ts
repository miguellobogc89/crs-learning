/** Invoice participant labels come exclusively from persisted, authorized company links. */
export function persistedInvoiceParties(links: readonly {
  to_record_id: string; definition: {key:string}; from_record: {values_json:unknown};
}[]) {
  const result = new Map<string,{issuer:string|null;customer:string|null}>();
  for (const link of links) {
    const values = link.from_record.values_json;
    if (!values || typeof values !== "object" || Array.isArray(values)) continue;
    const record = values as Record<string,unknown>;
    const name = [record.legal_name,record.name,record.company_name,record.business_name].find(v=>typeof v === "string" && v.trim());
    const parties = result.get(link.to_record_id) ?? {issuer:null,customer:null};
    if (typeof name === "string" && ["invoice_issuer","invoice_customer"].includes(link.definition.key)) {
      parties[link.definition.key === "invoice_issuer" ? "issuer" : "customer"] = name;
    }
    result.set(link.to_record_id,parties);
  }
  return result;
}

const EURO_CURRENCY = /^(?:EUR|EURO|EUROS|€)$/i;
const MONEY_KEYS = /(?:^|_)(?:amount|total|subtotal|price|cost|fee|net|tax|base|importe|precio|coste)(?:_|$)/i;

export function isMonetaryField(field: {key: string;field_type: string}): boolean {
  // A tax rate/discount percentage is not money even though "tax" is in its key.
  if (/(?:^|_)(?:rate|percent|percentage|ratio|quantity|count|units)(?:_|$)/i.test(field.key))
    return false;
  return field.field_type === "decimal" && MONEY_KEYS.test(field.key);
}

/** Never add a currency symbol unless the source or the currency field supports it. */
export function formatEngineNumericValue(
  value: unknown,
  field: { key: string; field_type: string },
  currency: string | null | undefined,
): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (field.field_type !== "decimal" && field.field_type !== "integer") return null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  const number = typeof value === "number" ? value : (() => {
    const raw = value.trim();
    // PostgreSQL JSON decimal strings can use 1133.81, while source
    // documents may use 1.133,81. Never erase the decimal dot blindly.
    if (/^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(raw))
      return Number(raw.replace(/\./g, "").replace(",", "."));
    if (/^-?\d+(?:,\d+)?$/.test(raw)) return Number(raw.replace(",", "."));
    return Number(raw);
  })();
  if (!Number.isFinite(number)) return null;
  if (isMonetaryField(field)) {
    const formatted = new Intl.NumberFormat("es-ES", {
      minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true,
    }).format(number);
    return EURO_CURRENCY.test(currency?.trim() ?? "") ? formatted + " €" : formatted;
  }
  return new Intl.NumberFormat("es-ES", {
    maximumFractionDigits: field.field_type === "integer" ? 0 : 4,
  }).format(number);
}

/** Only explicitly documented currencies count; do not infer from locale. */
export function invoiceDisplayCurrency(
  values: Record<string, unknown>,
  sourceText?: string | null,
): string | null {
  if (typeof values.currency === "string" && values.currency.trim())
    return values.currency.trim();
  if (sourceText && /(?:€|\bEUR\b)/i.test(sourceText)) return "EUR";
  return null;
}
