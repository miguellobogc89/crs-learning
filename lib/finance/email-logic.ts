// lib/finance/email-logic.ts
// Correos de suscripciones y facturas (Gmail): qué tipo de aviso es cada uno, de qué comercio, y las
// «suscripciones zombi» (te cobran después de un correo de cancelación). Puro: lo usan el servidor y los tests.
import { normalize } from "./logic";

export type EmailKind = "cancelacion" | "renovacion" | "subida" | "factura";

/** Búsqueda de Gmail: solo correos que pueden ser de suscripciones o facturas (el resto ni se descarga). */
export const GMAIL_QUERY =
  'newer_than:400d -in:chats (subject:(cancel OR cancelada OR cancelado OR cancelación OR "baja" OR suscripción OR subscription OR membership OR renovación OR renew OR renewal OR precio OR price OR factura OR invoice OR receipt OR recibo))';

const RULES: { kind: EmailKind; re: RegExp }[] = [
  // Cancelación confirmada (no «cancela cuando quieras», que es publicidad).
  { kind: "cancelacion", re: /\b(has cancelado|hemos cancelado|ha sido cancelad|se ha cancelado|cancelacion (de tu|confirmada)|confirmacion de (la )?(cancelacion|baja)|te has dado de baja|baja (confirmada|de tu (suscripcion|plan|cuenta))|subscription (has been |was |is )?(cancel|ended|terminated)|(cancel|ended)[a-z]* (your )?(subscription|membership|plan)|membership (has been |was )?cancel|you('ve| have) cancel|we('ve| have) cancel|cancellation (confirmed|confirmation))/ },
  { kind: "subida", re: /\b(cambio (de|en el) precio|nuevo precio|actualizacion (de|del) precio|subida de (precio|tarifa)|price (change|increase|update)|new price|updating (our|your) price)/ },
  { kind: "renovacion", re: /\b(se renovara|se renueva|renovacion (automatica|de tu)|proxima renovacion|will (auto[- ]?)?renew|renews on|upcoming renewal|renewal (reminder|notice)|your (subscription|plan) renews)/ },
  { kind: "factura", re: /\b(factura|invoice|receipt|recibo|payment (received|confirmation)|pago (recibido|confirmado))/ },
];

/** Tipo de aviso por asunto (y, si no basta, el principio del texto). null = no es de suscripciones ni facturas. */
export function classifyEmail(subject: string, snippet = ""): EmailKind | null {
  const s = normalize(subject);
  for (const r of RULES) if (r.re.test(s)) return r.kind;
  const both = normalize(`${subject} ${snippet}`);
  for (const r of RULES.slice(0, 3)) if (r.re.test(both)) return r.kind;
  return null;
}

const GENERIC = new Set(["mail", "email", "e", "info", "noreply", "no", "reply", "billing", "news", "newsletter", "notifications", "notification", "account", "accounts", "support", "help", "team", "hello", "payments", "invoice", "invoices", "service", "services", "mailer", "send", "updates", "go", "app", "my", "www", "co", "com", "es", "io", "net", "org", "uk", "de", "fr", "eu", "ai"]);

/** Comercio de un remitente: «ElevenLabs <billing@mail.elevenlabs.io>» → «elevenlabs». */
export function merchantOf(from: string): { merchant: string | null; domain: string | null } {
  const email = /<([^>]+)>/.exec(from)?.[1] ?? (from.includes("@") ? from.trim() : "");
  const domain = email.split("@")[1]?.toLowerCase().trim() ?? null;
  const parts = (domain ?? "").split(".").filter((p) => p && !GENERIC.has(p));
  const fromDomain = parts.length ? parts[parts.length - 1] : null;
  const display = normalize(from.replace(/<[^>]+>/, "").replace(/"/g, "")).split(" ").find((w) => w.length >= 4 && !GENERIC.has(w)) ?? null;
  return { merchant: fromDomain && fromDomain.length >= 3 ? fromDomain : display, domain };
}

export type EmailEvent = { messageId: string; date: string; merchant: string | null; subject: string; kind: EmailKind };
export type ChargeTx = { id: string; date: string; amount: number; description: string; counterparty: string | null };

/** El cargo es de ese comercio si su nombre aparece en el concepto (sin espacios ni puntos, «eleven labs» = «elevenlabs»). */
export function chargeMatches(merchant: string, tx: ChargeTx) {
  const m = merchant.replace(/[^a-z0-9]/g, "");
  if (m.length < 4) return false;
  const text = normalize(`${tx.description} ${tx.counterparty ?? ""}`).replace(/[^a-z0-9]/g, "");
  return text.includes(m);
}

/**
 * Suscripciones zombi: cargos de un comercio más de 2 días después de su último correo de cancelación. Una factura
 * posterior no la descarta: que te sigan facturando tras cancelar es justo el caso que se quiere avisar.
 */
export function findZombies(events: EmailEvent[], txs: ChargeTx[]) {
  const out: { merchant: string; cancelledOn: string; subject: string; messageId: string; charges: ChargeTx[] }[] = [];
  const byMerchant = new Map<string, EmailEvent[]>();
  for (const e of events) if (e.merchant) byMerchant.set(e.merchant, [...(byMerchant.get(e.merchant) ?? []), e]);
  for (const [merchant, list] of byMerchant) {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    const lastCancel = [...sorted].reverse().find((e) => e.kind === "cancelacion");
    if (!lastCancel) continue;
    const limit = new Date(Date.parse(`${lastCancel.date}T00:00:00Z`) + 2 * 86_400_000).toISOString().slice(0, 10);
    const charges = txs.filter((t) => t.amount < 0 && t.date > limit && chargeMatches(merchant, t));
    if (charges.length) out.push({ merchant, cancelledOn: lastCancel.date, subject: lastCancel.subject, messageId: lastCancel.messageId, charges });
  }
  return out;
}
