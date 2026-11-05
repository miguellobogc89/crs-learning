// lib/tenders/placsp.ts
// Lectura del feed ATOM oficial de la Plataforma de Contratación del Sector Público
// (formato CODICE). Código puro: sin base de datos ni red, para poder probarlo aislado.
import { XMLParser } from "fast-xml-parser";

/** Feed de licitaciones publicadas en perfiles de contratante (sin contratos menores). */
export const PLACSP_FEED_URL =
  "https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom";
/** Feed de contratos menores (normalmente ya adjudicados; solo nos quedamos con los que siguen en plazo). */
export const PLACSP_MINOR_FEED_URL =
  "https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_1044/contratosMenoresPerfilesContratantes.atom";

/** Tipos de procedimiento que mostramos. Los demás se ignoran al sincronizar. */
export type TenderKind = "menor" | "abreviado" | "simplificado";

/** Límites legales (servicios y suministros, sin IVA). */
export const ABBREVIATED_LIMIT = 60_000;
export const SIMPLIFIED_LIMIT = 140_000;

// Códigos de la lista SyndicationTenderingProcessCode de PLACSP.
const PROCEDURE_MINOR = "6";
const PROCEDURE_SIMPLIFIED = "9";

export const PROCEDURE_LABELS: Record<string, string> = {
  "1": "Abierto",
  "2": "Restringido",
  "3": "Negociado sin publicidad",
  "4": "Negociado con publicidad",
  "5": "Diálogo competitivo",
  "6": "Contrato menor",
  "7": "Derivado de acuerdo marco",
  "8": "Concurso de proyectos",
  "9": "Abierto simplificado",
  "13": "Licitación con negociación",
};

export const CONTRACT_TYPE_LABELS: Record<string, string> = {
  "1": "Suministros",
  "2": "Servicios",
  "3": "Obras",
  "21": "Gestión de servicios públicos",
  "22": "Concesión de servicios",
  "31": "Concesión de obras públicas",
  "32": "Concesión de obras",
  "7": "Administrativo especial",
  "8": "Privado",
  "50": "Patrimonial",
};

export const STATUS_LABELS: Record<string, string> = {
  PRE: "Anuncio previo",
  PUB: "En plazo",
  EV: "Pendiente de adjudicación",
  ADJ: "Adjudicada",
  RES: "Resuelta",
  ANUL: "Anulada",
};

/** CPV de software y servicios informáticos. */
const SOFTWARE_CPV_PREFIXES = ["72", "48"];
const SOFTWARE_WORDS =
  /\b(software|aplicaci[oó]n(es)? (web|m[oó]vil|inform[aá]tica)|plataforma (web|digital|tecnol[oó]gica)|p[aá]gina web|portal web|sede electr[oó]nica|desarrollo (web|inform[aá]tico)|programaci[oó]n inform[aá]tica|sistema(s)? de informaci[oó]n|inteligencia artificial|chatbot|ciberseguridad|base(s)? de datos|app\b)/i;

export type ParsedTender = {
  externalId: string;
  folderId: string | null;
  title: string;
  url: string | null;
  status: string | null;
  contractingBody: string | null;
  contractType: string | null;
  procedureCode: string | null;
  estimatedAmount: number | null;
  budgetWithoutTax: number | null;
  budgetWithTax: number | null;
  cpvCodes: string[];
  province: string | null;
  city: string | null;
  deadline: Date | null;
  updatedAt: Date | null;
  kind: TenderKind | null;
  isSoftware: boolean;
  summary: string | null;
};

export type ParsedFeedPage = {
  tenders: ParsedTender[];
  deletedIds: string[];
  nextUrl: string | null;
  /** Fecha de actualización más antigua de la página (el feed va de más nuevo a más viejo). */
  oldestUpdate: Date | null;
};

const ARRAY_TAGS = new Set([
  "entry",
  "link",
  "deleted-entry",
  "RequiredCommodityClassification",
  "ProcurementProjectLot",
]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => ARRAY_TAGS.has(name),
});

type Node = Record<string, unknown>;

function asNode(value: unknown): Node | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Node) : null;
}
function first(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}
/** Texto de un nodo, tanto si es un valor simple como si trae atributos (#text). */
export function text(value: unknown): string | null {
  const v = first(value);
  if (v === undefined || v === null) return null;
  if (typeof v === "string" || typeof v === "number") return String(v).trim() || null;
  const node = asNode(v);
  if (node && "#text" in node) return text(node["#text"]);
  return null;
}
function at(node: unknown, ...path: string[]): unknown {
  let current: unknown = node;
  for (const key of path) {
    const n = asNode(first(current));
    if (!n) return undefined;
    current = n[key];
  }
  return current;
}
function amount(value: unknown): number | null {
  const raw = text(value);
  if (!raw) return null;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function date(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Fin del plazo de ofertas. Sin hora, PLACSP entiende el final del día (hora peninsular). */
export function deadlineOf(endDate: string | null, endTime: string | null): Date | null {
  if (!endDate) return null;
  const day = endDate.slice(0, 10);
  const time = (endTime || "23:59:59").slice(0, 8);
  return date(`${day}T${time}+01:00`);
}

/** Importe de referencia: el valor estimado y, si falta, el presupuesto sin IVA. */
export function referenceAmount(t: Pick<ParsedTender, "estimatedAmount" | "budgetWithoutTax">) {
  return t.estimatedAmount ?? t.budgetWithoutTax;
}

export function classifyKind(procedureCode: string | null, reference: number | null): TenderKind | null {
  if (procedureCode === PROCEDURE_MINOR) return "menor";
  if (procedureCode !== PROCEDURE_SIMPLIFIED) return null;
  if (reference === null) return "simplificado";
  if (reference < ABBREVIATED_LIMIT) return "abreviado";
  return reference <= SIMPLIFIED_LIMIT ? "simplificado" : null;
}

export function isSoftwareTender(cpvCodes: string[], title: string): boolean {
  return (
    cpvCodes.some((c) => SOFTWARE_CPV_PREFIXES.some((p) => c.startsWith(p))) ||
    SOFTWARE_WORDS.test(title)
  );
}

function cpvList(project: unknown, lots: unknown): string[] {
  const codes = new Set<string>();
  const collect = (p: unknown) => {
    const list = at(p, "RequiredCommodityClassification");
    for (const item of Array.isArray(list) ? list : list ? [list] : []) {
      const code = text(at(item, "ItemClassificationCode"));
      if (code) codes.add(code);
    }
  };
  collect(project);
  for (const lot of Array.isArray(lots) ? lots : lots ? [lots] : [])
    collect(at(lot, "ProcurementProject"));
  return [...codes];
}

function linkHref(entry: Node): string | null {
  const links = entry.link;
  for (const l of Array.isArray(links) ? links : links ? [links] : []) {
    const node = asNode(l);
    const href = node?.["@_href"];
    if (typeof href === "string" && href) return href;
  }
  return null;
}

export function parseEntry(entry: Node): ParsedTender | null {
  const externalId = text(entry.id);
  if (!externalId) return null;
  const folder = at(entry, "ContractFolderStatus");
  const project = at(folder, "ProcurementProject");
  const process = at(folder, "TenderingProcess");
  const budget = at(project, "BudgetAmount");
  const location = at(project, "RealizedLocation");
  const title = text(at(project, "Name")) || text(entry.title) || "(Sin título)";
  const cpvCodes = cpvList(project, at(folder, "ProcurementProjectLot"));
  const procedureCode = text(at(process, "ProcedureCode"));
  const estimatedAmount = amount(at(budget, "EstimatedOverallContractAmount"));
  const budgetWithoutTax = amount(at(budget, "TaxExclusiveAmount"));
  const reference = estimatedAmount ?? budgetWithoutTax;
  return {
    externalId,
    folderId: text(at(folder, "ContractFolderID")),
    title,
    url: linkHref(entry),
    status: text(at(folder, "ContractFolderStatusCode")),
    contractingBody: text(at(folder, "LocatedContractingParty", "Party", "PartyName", "Name")),
    contractType: text(at(project, "TypeCode")),
    procedureCode,
    estimatedAmount,
    budgetWithoutTax,
    budgetWithTax: amount(at(budget, "TotalAmount")),
    cpvCodes,
    province: text(at(location, "CountrySubentity")),
    city: text(at(location, "Address", "CityName")),
    deadline: deadlineOf(
      text(at(process, "TenderSubmissionDeadlinePeriod", "EndDate")),
      text(at(process, "TenderSubmissionDeadlinePeriod", "EndTime")),
    ),
    updatedAt: date(text(entry.updated)),
    kind: classifyKind(procedureCode, reference),
    isSoftware: isSoftwareTender(cpvCodes, title),
    summary: text(entry.summary),
  };
}

export function parseFeedPage(xml: string): ParsedFeedPage {
  const doc = asNode(parser.parse(xml));
  const feed = asNode(doc?.feed);
  if (!feed) throw new Error("La respuesta de PLACSP no es un feed ATOM válido");
  const entries = Array.isArray(feed.entry) ? (feed.entry as Node[]) : [];
  const tenders = entries.map(parseEntry).filter((t): t is ParsedTender => t !== null);
  const deleted = feed["deleted-entry"];
  const deletedIds = (Array.isArray(deleted) ? deleted : [])
    .map((d) => asNode(d)?.["@_ref"])
    .filter((ref): ref is string => typeof ref === "string" && ref.length > 0);
  let nextUrl: string | null = null;
  const links = feed.link;
  for (const l of Array.isArray(links) ? links : links ? [links] : []) {
    const node = asNode(l);
    if (node?.["@_rel"] === "next" && typeof node["@_href"] === "string") nextUrl = node["@_href"];
  }
  const oldest = tenders.reduce<Date | null>(
    (min, t) => (t.updatedAt && (!min || t.updatedAt < min) ? t.updatedAt : min),
    null,
  );
  return { tenders, deletedIds, nextUrl, oldestUpdate: oldest };
}

/** ¿Se puede presentar oferta todavía y es de los tipos que mostramos? */
export function isOpenOpportunity(t: ParsedTender, now = new Date()): boolean {
  if (!t.kind) return false;
  if (t.status !== "PUB") return false;
  return !t.deadline || t.deadline.getTime() > now.getTime();
}
