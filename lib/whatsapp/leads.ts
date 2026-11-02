// Leads: the imported contacts and the WhatsApp conversations of one number, joined by phone, and the fixed groups
// the «Leads» screen offers. Pure (no database), so the same rules run in tests.

import { DEFAULT_STAGE, normalizeText } from "./contacts";

export type LeadContact = {
  id: string;
  name: string;
  phone: string | null;
  category: string | null;
  specialty: string | null;
  city: string | null;
  rating: number | null;
  classification: string | null;
  stage: string;
  do_not_contact: boolean;
  consent: boolean;
  last_contacted_at: Date | string | null;
  last_reply_at: Date | string | null;
};
export type LeadConversation = {
  id: string;
  contact_phone: string;
  contact_name: string | null;
  unread_count: number;
  last_message_at: Date | string;
  last_inbound_at: Date | string | null;
};
/** A lead is a contact (maybe never written to) or someone who wrote without being in the list (`contact` null). */
export type Lead = { key: string; contact: LeadContact | null; conversation: LeadConversation | null };

const time = (d: Date | string | null | undefined) => (d ? new Date(d).getTime() : 0);
const discarded = (c: LeadContact) =>
  c.do_not_contact || normalizeText(c.stage) === "descartado" || ["descartada", "descartado"].includes(normalizeText(c.classification || ""));

/** Their last message is the latest one in the conversation: they are waiting for an answer. */
export const awaitingReply = (conv: LeadConversation | null) =>
  !!conv?.last_inbound_at && time(conv.last_inbound_at) >= time(conv.last_message_at);

export type GroupKey =
  | "por_contestar" | "sin_leer" | "nuevos"
  | "sin_contactar" | "sin_respuesta" | "respondieron" | "interesados" | "clientes" | "descartados"
  | "estrellas_5" | "estrellas_4" | "todos";

export const LEAD_GROUPS: { key: GroupKey; label: string; section: "Bandeja" | "Embudo" | "Valoración" | "Todos"; hint: string }[] = [
  { key: "por_contestar", label: "Por contestar", section: "Bandeja", hint: "Te han escrito y aún no les has respondido" },
  { key: "sin_leer", label: "Sin leer", section: "Bandeja", hint: "Mensajes que nadie ha abierto" },
  { key: "nuevos", label: "No están en tu lista", section: "Bandeja", hint: "Te escribieron sin estar en Contactos" },
  { key: "sin_contactar", label: "Sin contactar", section: "Embudo", hint: "Con WhatsApp y sin ningún envío todavía" },
  { key: "sin_respuesta", label: "Sin respuesta", section: "Embudo", hint: "Les escribiste y no han contestado" },
  { key: "respondieron", label: "Han respondido", section: "Embudo", hint: "Contestaron alguna vez" },
  { key: "interesados", label: "Interesados", section: "Embudo", hint: "Seguimiento «Interesado»" },
  { key: "clientes", label: "Clientes", section: "Embudo", hint: "Seguimiento «Cliente»" },
  { key: "descartados", label: "Descartados", section: "Embudo", hint: "Descartados o «No contactar»" },
  { key: "estrellas_5", label: "5 estrellas", section: "Valoración", hint: "Valoración de 5 en Google" },
  { key: "estrellas_4", label: "4 estrellas o más", section: "Valoración", hint: "Valoración de 4 o más" },
  { key: "todos", label: "Todos los leads", section: "Todos", hint: "Todos tus contactos y conversaciones" },
];

/** Whether a lead belongs to a group. Discarded leads only appear in «Descartados» and «Todos». */
export function inGroup(lead: Lead, group: GroupKey): boolean {
  const c = lead.contact, conv = lead.conversation;
  if (group === "todos") return true;
  if (group === "nuevos") return !c && !!conv;
  if (group === "sin_leer") return (conv?.unread_count ?? 0) > 0;
  if (group === "por_contestar") return awaitingReply(conv) && !(c && c.do_not_contact);
  if (!c) return false;
  if (group === "descartados") return discarded(c);
  if (discarded(c)) return false;
  switch (group) {
    case "sin_contactar": return !!c.phone && !c.last_contacted_at && !conv && c.stage === DEFAULT_STAGE;
    case "sin_respuesta": return !!c.last_contacted_at && !c.last_reply_at && !conv?.last_inbound_at;
    case "respondieron": return !!c.last_reply_at || !!conv?.last_inbound_at;
    case "interesados": return normalizeText(c.stage) === "interesado";
    case "clientes": return normalizeText(c.stage) === "cliente";
    case "estrellas_5": return (c.rating ?? 0) >= 4.95;
    case "estrellas_4": return (c.rating ?? 0) >= 4;
  }
  return false;
}

/** Contacts and conversations of one number as leads: matched by phone; conversations nobody imported come alone. */
export function buildLeads(contacts: LeadContact[], conversations: LeadConversation[]): Lead[] {
  const byPhone = new Map(conversations.map(c => [c.contact_phone, c]));
  const used = new Set<string>();
  const leads: Lead[] = contacts.map(c => {
    const conv = c.phone ? byPhone.get(c.phone) ?? null : null;
    if (conv) used.add(conv.id);
    return { key: c.id, contact: c, conversation: conv };
  });
  for (const conv of conversations) if (!used.has(conv.id)) leads.push({ key: `conv:${conv.id}`, contact: null, conversation: conv });
  return leads;
}

export function groupCounts(leads: Lead[]): Record<GroupKey, number> {
  const counts = Object.fromEntries(LEAD_GROUPS.map(g => [g.key, 0])) as Record<GroupKey, number>;
  for (const lead of leads) for (const g of LEAD_GROUPS) if (inGroup(lead, g.key)) counts[g.key]++;
  return counts;
}

/**
 * The leads of a group, searched and ordered for working through them: those waiting longest first in «Por
 * contestar»; elsewhere the latest activity first, then the best rated, then by name.
 */
export function leadsOf(leads: Lead[], group: GroupKey, q = ""): Lead[] {
  const terms = normalizeText(q).split(" ").filter(Boolean);
  const text = (l: Lead) => normalizeText([l.contact?.name, l.contact?.city, l.contact?.specialty, l.conversation?.contact_name,
    l.contact?.phone ?? l.conversation?.contact_phone].filter(Boolean).join(" "));
  const list = leads.filter(l => inGroup(l, group) && (!terms.length || terms.every(t => text(l).includes(t))));
  const activity = (l: Lead) => Math.max(time(l.conversation?.last_message_at), time(l.contact?.last_contacted_at), time(l.contact?.last_reply_at));
  return list.sort((a, b) => group === "por_contestar"
    ? time(a.conversation?.last_inbound_at) - time(b.conversation?.last_inbound_at)
    : activity(b) - activity(a) || (b.contact?.rating ?? -1) - (a.contact?.rating ?? -1)
      || (a.contact?.name ?? a.conversation?.contact_phone ?? "").localeCompare(b.contact?.name ?? b.conversation?.contact_phone ?? "", "es"));
}

export const isGroup = (v: unknown): v is GroupKey => typeof v === "string" && LEAD_GROUPS.some(g => g.key === v);
