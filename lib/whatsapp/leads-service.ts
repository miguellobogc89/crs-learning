import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { uuid, WhatsAppError } from "./rules";
import { DEFAULT_STAGE } from "./contacts";
import { buildLeads, groupCounts, isGroup, leadsOf, type GroupKey } from "./leads";

const MAX = 20000;

async function loadLeads(workspaceId: string, accountId: string | null) {
  const [contacts, conversations] = await Promise.all([
    prisma.whatsapp_contacts.findMany({
      where: { workspace_id: workspaceId },
      select: { id: true, name: true, phone: true, category: true, specialty: true, city: true, rating: true, classification: true,
        stage: true, do_not_contact: true, consent: true, last_contacted_at: true, last_reply_at: true },
      take: MAX,
    }),
    accountId
      ? prisma.whatsapp_conversations.findMany({
          where: { workspace_id: workspaceId, account_id: accountId },
          select: { id: true, contact_phone: true, contact_name: true, unread_count: true, last_message_at: true, last_inbound_at: true },
          take: MAX,
        })
      : Promise.resolve([]),
  ]);
  return buildLeads(contacts, conversations);
}

const params = (url: URL) => {
  const raw = url.searchParams.get("accountId");
  const group = url.searchParams.get("group") || "por_contestar";
  if (!isGroup(group)) throw new WhatsAppError("Grupo no válido");
  return { accountId: raw ? uuid(raw) : null, group: group as GroupKey, q: (url.searchParams.get("q") || "").slice(0, 100) };
};

/** Counts of every group and one page of the chosen one, each with its last message. */
export async function leadsOverview(workspaceId: string, url: URL) {
  const { accountId, group, q } = params(url);
  const offset = Math.max(0, Math.min(MAX, Math.floor(Number(url.searchParams.get("offset")) || 0)));
  const leads = await loadLeads(workspaceId, accountId);
  const list = leadsOf(leads, group, q);
  const page = list.slice(offset, offset + 50);
  const ids = page.map(l => l.conversation?.id).filter((x): x is string => !!x);
  const last = ids.length
    ? await prisma.$queryRaw<{ conversation_id: string; text: string; direction: string; status: string }[]>`
        SELECT DISTINCT ON (conversation_id) conversation_id, text, direction, status
        FROM whatsapp_messages
        WHERE workspace_id = ${workspaceId}::uuid AND conversation_id IN (${Prisma.join(ids.map(id => Prisma.sql`${id}::uuid`))})
        ORDER BY conversation_id, created_at DESC, id DESC`
    : [];
  const lastOf = new Map(last.map(m => [m.conversation_id, { text: m.text.slice(0, 160), direction: m.direction, status: m.status }]));
  return {
    counts: groupCounts(leads),
    total: list.length,
    items: page.map(l => ({ ...l, lastMessage: l.conversation ? lastOf.get(l.conversation.id) ?? null : null })),
  };
}

/** Contact ids of a group (for «Seleccionar todo el grupo»). Leads that are only a conversation have no contact. */
export async function leadIds(workspaceId: string, url: URL) {
  const { accountId, group, q } = params(url);
  const ids = leadsOf(await loadLeads(workspaceId, accountId), group, q).flatMap(l => l.contact ? [l.contact.id] : []);
  if (ids.length > 5000) throw new WhatsAppError("El grupo tiene más de 5.000 contactos: busca para acotarlo");
  return ids;
}

/** Someone who wrote without being in the list becomes a contact (they started the conversation). */
export async function adoptConversation(workspaceId: string, input: Record<string, unknown>) {
  const conv = await prisma.whatsapp_conversations.findFirst({ where: { workspace_id: workspaceId, id: uuid(input.conversationId) } });
  if (!conv) throw new WhatsAppError("Conversación no encontrada", 404);
  const existing = await prisma.whatsapp_contacts.findFirst({ where: { workspace_id: workspaceId, phone: conv.contact_phone }, select: { id: true } });
  if (existing) return { id: existing.id };
  const name = typeof input.name === "string" && input.name.trim() ? input.name.trim().slice(0, 300) : conv.contact_name || `+${conv.contact_phone}`;
  const created = await prisma.whatsapp_contacts.upsert({
    where: { workspace_id_external_key: { workspace_id: workspaceId, external_key: `tel:${conv.contact_phone}` } },
    create: { workspace_id: workspaceId, external_key: `tel:${conv.contact_phone}`, name, phone: conv.contact_phone,
      stage: conv.last_inbound_at ? "Respondió" : DEFAULT_STAGE, last_reply_at: conv.last_inbound_at,
      attributes: { Origen: "Escribió por WhatsApp" } },
    update: {},
    select: { id: true },
  });
  return { id: created.id };
}
