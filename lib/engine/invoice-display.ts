/**
 * Read-only formatting of invoice rows. Source information is not silently
 * persisted as business entities: entity creation needs identity reconciliation.
 */
export type InvoicePartyLabels = { issuer: string | null; customer: string | null };

const normalizeCompanyName = (value: string): string =>
  value.replace(/[`´‘’]/g, "'").replace(/\s+/g, " ").trim()
    .replace(/[,:;]+$/, "");

const canonicalCompanyName = (value: string): string =>
  normalizeCompanyName(value).toLocaleLowerCase("es").replace(/[^a-z0-9]/gi, "");

function firstNamedValue(values: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = values[key];
    if (typeof value === "string" && value.trim() && value.length <= 200)
      return normalizeCompanyName(value);
  }
  return null;
}

// Stop at a tabular column or a separate label rather than treating adjacent
// invoice metadata ("Nº de contrato", etc.) as part of a company name.
function labelValue(line: string, label: RegExp): string | null {
  const match = label.exec(line);
  if (!match) return null;
  const rest = line.slice(match.index + match[0].length)
    .split(/\s{2,}|\s+(?=(?:N[º°]\.?(?:\s+de)?\s+(?:contrato|factura)|CIF|NIF|Direcci[oó]n|Vto\.)\s*:)/i)[0];
  const candidate = normalizeCompanyName(rest);
  return candidate.length >= 3 && candidate.length <= 180 ? candidate : null;
}

const COMPANY_SUFFIX = /(?:S\.?\s*L\.?\s*U?\.?|S\.?\s*A\.?\s*U?\.?)(?:\s|$|,)/i;
const CUSTOMER_LABEL = /\b(?:CLIENTE|TITULAR|RECEPTOR|COMPRADOR|DESTINATARIO|BILL\s+TO)\s*:\s*/i;
const ISSUER_LABEL = /\b(?:EMISOR|VENDEDOR|PROVEEDOR|RAZ[oó]N\s+SOCIAL\s+EMISOR|ISSUED\s+BY)\s*:\s*/i;

/**
 * Best-effort invoice participant labels for legacy imports without those
 * fields. Explicit schema values take precedence. Never infer a role merely
 * because a familiar company name happens to appear in the document.
 */
export function getInvoicePartyLabels(
  values: Record<string, unknown>, sourceText: string | null | undefined,
): InvoicePartyLabels {
  let issuer = firstNamedValue(values, [
    "issuer_name", "issuer", "seller_name", "supplier_name",
    "vendor_name", "sellerName", "supplierName",
  ]);
  let customer = firstNamedValue(values, [
    "customer_name", "buyer_name", "client_name", "recipient_name",
    "customerName", "buyerName", "clientName",
  ]);
  if (issuer && customer) return { issuer, customer };
  if (!sourceText) return { issuer, customer };

  // Read the opening portion of the PDF. It contains the labelled parties
  // in conventional commercial documents and avoids regulatory appendices.
  const lines = sourceText.slice(0, 14000).split(/\r?\n/).filter(x => x.trim());
  if (!customer) {
    for (const line of lines) {
      const named = labelValue(line, CUSTOMER_LABEL);
      if (named) { customer = named; break; }
    }
  }
  if (!issuer) {
    for (const line of lines) {
      const named = labelValue(line, ISSUER_LABEL);
      if (named) { issuer = named; break; }
    }
  }
  if (!issuer) {
    for (const rawLine of lines.slice(0, 30)) {
      const line = rawLine.trim();
      // Some invoices state the legal issuer directly before "con sede social".
      const legal = line.match(/^(.{3,160}?)\s+con\s+sede\s+social\b/i);
      const candidate = legal ? normalizeCompanyName(legal[1]) :
        normalizeCompanyName(line.split(/\s{2,}/)[0]);
      if (!COMPANY_SUFFIX.test(candidate) || candidate.length > 140 ||
          /^(?:cliente|titular|receptor|comprador|factura|cif|nif)\s*:/i.test(candidate))
        continue;
      if (customer && canonicalCompanyName(candidate) === canonicalCompanyName(customer))
        continue;
      issuer = candidate;
      break;
    }
  }
  if (issuer && customer && canonicalCompanyName(issuer) === canonicalCompanyName(customer))
    issuer = null;
  return { issuer, customer };
}

const EURO_CURRENCY = /^(?:EUR|EURO|EUROS|€)$/i;
const MONEY_KEYS = /(?:^|_)(?:amount|total|subtotal|price|cost|fee|net|tax|base|importe|precio|coste)(?:_|$)/i;

export function isMonetaryField(field: {key: string;field_type: string}): boolean {
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
  const number = typeof value === "number" ? value :
    Number(value.trim().replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(number)) return null;
  if (isMonetaryField(field)) {
    const formatted = new Intl.NumberFormat("es-ES", {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
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
