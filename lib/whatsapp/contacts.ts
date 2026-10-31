// Pure contact rules shared by the browser (import preview) and the server (import, campaigns).
// No database access here so the same code runs in both places and in node:test.

export type ContactFieldKey =
  | "name"
  | "category"
  | "specialty"
  | "service"
  | "address"
  | "city"
  | "province"
  | "landline"
  | "mobile"
  | "whatsapp"
  | "email"
  | "website"
  | "rating"
  | "classification"
  | "maps_url"
  | "consent"
  | "consent_source"
  | "consent_at"
  | "do_not_contact"
  | "stage";

export const CONTACT_FIELDS: {
  key: ContactFieldKey;
  label: string;
  aliases: string[];
}[] = [
  { key: "name", label: "Empresa / nombre", aliases: ["empresa", "nombre", "nombre comercial", "razon social", "compania", "negocio", "name", "company"] },
  { key: "category", label: "Categoría", aliases: ["categoria", "sector", "category"] },
  { key: "specialty", label: "Especialidad", aliases: ["especialidad", "subcategoria", "tipo"] },
  { key: "service", label: "Servicio", aliases: ["servicio", "actividad"] },
  { key: "address", label: "Dirección", aliases: ["direccion", "domicilio", "address"] },
  { key: "city", label: "Localidad", aliases: ["localidad", "ciudad", "municipio", "poblacion", "city"] },
  { key: "province", label: "Provincia", aliases: ["provincia", "region", "comunidad", "province"] },
  { key: "landline", label: "Teléfono fijo", aliases: ["telefono fijo", "fijo", "landline"] },
  { key: "mobile", label: "Teléfono móvil", aliases: ["telefono movil", "movil", "telefono", "celular", "phone", "mobile"] },
  { key: "whatsapp", label: "WhatsApp", aliases: ["whatsapp confirmado", "whatsapp", "telefono whatsapp"] },
  { key: "email", label: "Email", aliases: ["email comercial", "email", "e-mail", "correo", "correo electronico"] },
  { key: "website", label: "Sitio web", aliases: ["sitio web", "web", "pagina web", "website", "url"] },
  { key: "rating", label: "Estrellas", aliases: ["estrellas", "valoracion", "puntuacion", "rating"] },
  { key: "classification", label: "Clasificación", aliases: ["clasificacion", "calificacion", "prioridad"] },
  { key: "maps_url", label: "Google Maps", aliases: ["google maps", "maps", "enlace maps"] },
  { key: "consent", label: "Autorización", aliases: ["autorizacion", "consentimiento", "opt in", "optin", "permiso"] },
  { key: "consent_source", label: "Fuente del permiso", aliases: ["fuente del permiso", "origen del permiso", "fuente consentimiento"] },
  { key: "consent_at", label: "Fecha de autorización", aliases: ["fecha de autorizacion", "fecha consentimiento", "fecha del permiso"] },
  { key: "do_not_contact", label: "No contactar", aliases: ["no contactar", "no molestar", "baja"] },
  { key: "stage", label: "Seguimiento", aliases: ["seguimiento", "estado", "fase"] },
];

export const DEFAULT_STAGE = "Sin contactar";
export const STAGES = [
  "Sin contactar",
  "Contactado",
  "Respondió",
  "Interesado",
  "Cliente",
  "Descartado",
];
export const DEFAULT_COUNTRY_CODE = "34";
export const CAMPAIGN_LIMIT = 250;

export type Mapping = Partial<Record<ContactFieldKey, string>>;

export type ContactInput = {
  external_key: string;
  name: string;
  category: string | null;
  specialty: string | null;
  city: string | null;
  province: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  maps_url: string | null;
  rating: number | null;
  classification: string | null;
  stage: string;
  do_not_contact: boolean;
  consent: boolean;
  consent_source: string | null;
  consent_at: Date | null;
  attributes: Record<string, string>;
};

export function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[_.:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** RFC 4180 parser with quoted fields; detects comma or semicolon from the header line. */
export function parseCsv(input: string): { headers: string[]; rows: string[][] } {
  const text = input.replace(/^﻿/, "");
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const delimiter =
    (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length
      ? ";"
      : ",";
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ""));
  const headers = (nonEmpty.shift() || []).map((h) => h.trim());
  return { headers, rows: nonEmpty };
}

/** Exact alias match on normalized headers; each header and each field is used once. */
export function detectMapping(headers: string[]): Mapping {
  const mapping: Mapping = {};
  const used = new Set<string>();
  for (const field of CONTACT_FIELDS)
    for (const alias of field.aliases) {
      const header = headers.find(
        (h) => !used.has(h) && normalizeText(h) === alias,
      );
      if (header) {
        mapping[field.key] = header;
        used.add(header);
        break;
      }
    }
  return mapping;
}

/** Digits with country code and no "+", the format WhatsApp Cloud API and conversations use. */
export function normalizePhone(
  value: string | null | undefined,
  countryCode = DEFAULT_COUNTRY_CODE,
): string | null {
  if (!value) return null;
  let raw = value.trim();
  const wa = raw.match(/wa\.me\/(\+?[\d\s-]+)/i) || raw.match(/[?&]phone=(\+?[\d\s-]+)/i);
  if (wa) raw = wa[1];
  else if (/[a-z]/i.test(raw.replace(/^tel:/i, ""))) return null;
  raw = raw.replace(/^tel:/i, "");
  const plus = raw.startsWith("+");
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (!plus && digits.startsWith("00")) digits = digits.slice(2);
  else if (!plus && countryCode === "34" && digits.length === 9 && /^[6-9]/.test(digits))
    digits = countryCode + digits;
  if (!/^[1-9]\d{7,14}$/.test(digits)) return null;
  return digits;
}

export function parseBoolean(value: string | null | undefined): boolean {
  return ["si", "sí", "s", "yes", "y", "true", "1", "x", "ok", "autorizado"].includes(
    normalizeText(value || ""),
  );
}

export function parseRating(value: string | null | undefined): number | null {
  if (!value?.trim()) return null;
  const n = Number(value.replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n >= 0 && n <= 5 ? n : null;
}

export function parseDate(value: string | null | undefined): Date | null {
  const v = value?.trim();
  if (!v) return null;
  const es = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  const d = es
    ? new Date(Date.UTC(Number(es[3]), Number(es[2]) - 1, Number(es[1])))
    : new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

/** Stable identity for re-imports: Google Maps place, else phone, else name + city. */
export function externalKey(input: {
  maps_url: string | null;
  phone: string | null;
  name: string;
  city: string | null;
}) {
  const place =
    input.maps_url?.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i)?.[1] ||
    input.maps_url?.match(/[?&]cid=(\d+)/)?.[1];
  if (place) return `maps:${place.toLowerCase()}`;
  if (input.phone) return `tel:${input.phone}`;
  return `name:${normalizeText(input.name)}|${normalizeText(input.city || "")}`;
}

function clean(value: string | undefined, max = 500) {
  const v = (value || "").trim();
  return v ? v.slice(0, max) : null;
}

export type ImportPlan = {
  contacts: ContactInput[];
  skipped: { row: number; reason: string }[];
  merged: number;
  sharedPhones: { phone: string; names: string[] }[];
  withWhatsapp: number;
};

export function planImport(
  headers: string[],
  rows: string[][],
  mapping: Mapping,
  countryCode = DEFAULT_COUNTRY_CODE,
): ImportPlan {
  if (!mapping.name) throw new Error("Indica qué columna tiene el nombre de la empresa");
  const index = new Map(headers.map((h, i) => [h, i]));
  const byKey = new Map<string, ContactInput>();
  const skipped: ImportPlan["skipped"] = [];
  let merged = 0;
  rows.forEach((cells, i) => {
    const get = (key: ContactFieldKey) => {
      const header = mapping[key];
      const at = header === undefined ? undefined : index.get(header);
      return at === undefined ? undefined : cells[at];
    };
    const name = clean(get("name"), 300);
    if (!name) {
      skipped.push({ row: i + 2, reason: "Sin nombre de empresa" });
      return;
    }
    const attributes: Record<string, string> = {};
    headers.forEach((h, j) => {
      const v = (cells[j] || "").trim();
      if (h && v) attributes[h] = v.slice(0, 2000);
    });
    const phone =
      normalizePhone(get("whatsapp"), countryCode) ||
      normalizePhone(get("mobile"), countryCode);
    const maps_url = clean(get("maps_url"), 2000);
    const city = clean(get("city"), 200);
    const stage = clean(get("stage"), 60) || DEFAULT_STAGE;
    const contact: ContactInput = {
      external_key: externalKey({ maps_url, phone, name, city }),
      name,
      category: clean(get("category"), 200),
      specialty: clean(get("specialty"), 200),
      city,
      province: clean(get("province"), 200),
      phone,
      email: clean(get("email"), 320),
      website: clean(get("website"), 2000),
      maps_url,
      rating: parseRating(get("rating")),
      classification: clean(get("classification"), 60),
      stage,
      do_not_contact: parseBoolean(get("do_not_contact")),
      consent: parseBoolean(get("consent")),
      consent_source: clean(get("consent_source"), 300),
      consent_at: parseDate(get("consent_at")),
      attributes,
    };
    if (byKey.has(contact.external_key)) merged++;
    byKey.set(contact.external_key, contact);
  });
  const contacts = [...byKey.values()];
  const phones = new Map<string, string[]>();
  for (const c of contacts)
    if (c.phone) phones.set(c.phone, [...(phones.get(c.phone) || []), c.name]);
  return {
    contacts,
    skipped,
    merged,
    sharedPhones: [...phones]
      .filter(([, names]) => names.length > 1)
      .map(([phone, names]) => ({ phone, names })),
    withWhatsapp: contacts.filter((c) => c.phone).length,
  };
}

/**
 * Re-importing refreshes descriptive data from the file but never undoes work done in the app:
 * a "do not contact" or a consent stays, and a stage moved forward in the app is kept.
 */
export function mergeForUpdate(
  existing: { stage: string; do_not_contact: boolean; consent: boolean; consent_source: string | null; consent_at: Date | null },
  incoming: ContactInput,
) {
  const keepStage =
    existing.stage !== DEFAULT_STAGE && incoming.stage === DEFAULT_STAGE;
  return {
    ...incoming,
    stage: keepStage ? existing.stage : incoming.stage,
    do_not_contact: existing.do_not_contact || incoming.do_not_contact,
    consent: existing.consent || incoming.consent,
    consent_source: incoming.consent_source || existing.consent_source,
    consent_at: incoming.consent_at || existing.consent_at,
  };
}

export type SendableContact = {
  id: string;
  name: string;
  phone: string | null;
  do_not_contact: boolean;
  consent: boolean;
  classification: string | null;
  stage: string;
  last_contacted_at: Date | string | null;
  city?: string | null;
  province?: string | null;
  category?: string | null;
  specialty?: string | null;
  email?: string | null;
  website?: string | null;
  attributes?: unknown;
};

export const SKIP_REASONS: Record<string, string> = {
  no_phone: "Sin WhatsApp",
  do_not_contact: "No contactar",
  discarded: "Descartado",
  already_contacted: "Ya contactado",
  missing_variable: "Falta un dato de la plantilla",
  duplicate_phone: "Teléfono repetido en el envío",
};

export function blockReason(
  c: SendableContact,
  options: { excludeContacted?: boolean } = {},
): string | null {
  if (!c.phone) return "no_phone";
  if (c.do_not_contact) return "do_not_contact";
  if (
    ["descartada", "descartado"].includes(normalizeText(c.classification || "")) ||
    normalizeText(c.stage) === "descartado"
  )
    return "discarded";
  if (options.excludeContacted && c.last_contacted_at) return "already_contacted";
  return null;
}

/** Variable source: "field:<key>", "attr:<column>" or "text:<fixed value>". */
export function variableValue(c: SendableContact, source: string): string {
  if (source.startsWith("text:")) return source.slice(5).trim();
  if (source.startsWith("field:")) {
    const v = (c as unknown as Record<string, unknown>)[source.slice(6)];
    return typeof v === "string" ? v.trim() : "";
  }
  if (source.startsWith("attr:")) {
    const attrs =
      c.attributes && typeof c.attributes === "object"
        ? (c.attributes as Record<string, unknown>)
        : {};
    const v = attrs[source.slice(5)];
    return typeof v === "string" ? v.trim() : "";
  }
  return "";
}

export function planRecipients(
  contacts: SendableContact[],
  sources: string[],
  options: { excludeContacted?: boolean } = {},
) {
  const seen = new Set<string>();
  return contacts.map((c) => {
    let reason = blockReason(c, options);
    const parameters = sources.map((s) => variableValue(c, s).slice(0, 1024));
    if (!reason && parameters.some((p) => !p)) reason = "missing_variable";
    if (!reason && seen.has(c.phone!)) reason = "duplicate_phone";
    if (!reason) seen.add(c.phone!);
    return { contact: c, parameters, reason };
  });
}

/** Opt-out words a recipient may answer with. */
export function isOptOut(text: string) {
  return /^(baja|stop|parar|darme de baja|dar de baja|no me escrib\w*|no quiero (mas|más) mensajes|unsubscribe)[\s.!¡]*$/i.test(
    normalizeText(text).replace(/[¡!.]/g, "").trim(),
  );
}
