import "server-only";
import { prisma } from "@/lib/prisma";
import { precedingStatuses } from "./rules";
import { DEFAULT_STAGE, isOptOut } from "./contacts";

type Inbound = {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  button?: { text: string };
  interactive?: {
    button_reply?: { title: string };
    list_reply?: { title: string };
  };
  image?: { caption?: string };
  document?: { caption?: string; filename?: string };
};
type Value = {
  metadata?: { phone_number_id?: string };
  contacts?: { wa_id: string; profile?: { name?: string } }[];
  messages?: Inbound[];
  statuses?: {
    id: string;
    status: string;
    biz_opaque_callback_data?: string;
    errors?: { code?: number }[];
  }[];
};
export async function processWebhook(body: {
  object?: string;
  entry?: { id: string; changes?: { field?: string; value?: Value }[] }[];
}) {
  if (body.object !== "whatsapp_business_account") return;
  for (const entry of body.entry || [])
    for (const change of entry.changes || []) {
      const value = change.value;
      if (!value?.metadata?.phone_number_id) continue;
      const account = await prisma.whatsapp_accounts.findFirst({
        where: {
          phone_number_id: value.metadata.phone_number_id,
          waba_id: entry.id,
          status: "active",
        },
      });
      if (!account) continue;
      for (const status of value.statuses || []) {
        const allowed = precedingStatuses(status.status);
        if (!allowed.length) continue;
        // callback id correlates a status arriving before the send HTTP response (or after a timeout).
        const callback = status.biz_opaque_callback_data;
        const safeCallback =
          callback && /^[0-9a-f-]{36}$/i.test(callback) ? callback : null;
        const message = await prisma.whatsapp_messages.findFirst({
          where: {
            workspace_id: account.workspace_id,
            direction: "out",
            OR: [
              { provider_id: status.id },
              ...(safeCallback ? [{ id: safeCallback }] : []),
            ],
          },
        });
        if (!message) continue;
        const conversation = await prisma.whatsapp_conversations.findFirst({
          where: {
            id: message.conversation_id,
            workspace_id: account.workspace_id,
            account_id: account.id,
          },
        });
        if (!conversation) continue;
        await prisma.whatsapp_messages.updateMany({
          where: {
            id: message.id,
            workspace_id: account.workspace_id,
            status: { in: allowed },
          },
          data: {
            provider_id: status.id,
            status: status.status,
            error:
              status.status === "failed"
                ? `Meta: ${status.errors?.[0]?.code || "error"}`
                : null,
          },
        });
      }
      for (const m of value.messages || []) {
        if (!m.id || !/^\d{7,15}$/.test(m.from)) continue;
        const date = new Date(Number(m.timestamp) * 1000);
        if (!Number.isFinite(date.getTime())) continue;
        const name =
          value.contacts
            ?.find((c) => c.wa_id === m.from)
            ?.profile?.name?.slice(0, 200) || null;
        const text =
          m.text?.body ||
          m.button?.text ||
          m.interactive?.button_reply?.title ||
          m.interactive?.list_reply?.title ||
          m.image?.caption ||
          m.document?.caption ||
          m.document?.filename ||
          `[${m.type}: contenido no disponible en esta vista]`;
        const isNew = await prisma.$transaction(async (tx) => {
          const conversation = await tx.whatsapp_conversations.upsert({
            where: {
              account_id_contact_phone: {
                account_id: account.id,
                contact_phone: m.from,
              },
            },
            create: {
              workspace_id: account.workspace_id,
              account_id: account.id,
              contact_phone: m.from,
              contact_name: name,
              last_message_at: date,
            },
            update: name ? { contact_name: name } : {},
          });
          const inserted = await tx.whatsapp_messages.createMany({
            data: [
              {
                workspace_id: account.workspace_id,
                conversation_id: conversation.id,
                provider_id: m.id,
                direction: "in",
                kind: m.type,
                text: text.slice(0, 10000),
                status: "received",
                created_at: date,
              },
            ],
            skipDuplicates: true,
          });
          if (!inserted.count) return false;
          await tx.whatsapp_conversations.update({
            where: { id: conversation.id },
            data: { unread_count: { increment: 1 } },
          });
          await tx.whatsapp_conversations.updateMany({
            where: {
              id: conversation.id,
              OR: [
                { last_inbound_at: null },
                { last_inbound_at: { lt: date } },
              ],
            },
            data: { last_inbound_at: date },
          });
          await tx.whatsapp_conversations.updateMany({
            where: { id: conversation.id, last_message_at: { lt: date } },
            data: { last_message_at: date },
          });
          return true;
        });
        // The message is already stored; a failure here must not make Meta resend it.
        if (isNew)
          await recordReply(account.workspace_id, m.from, date, isOptOut(text)).catch(
            (e) => console.error("[whatsapp] Contact reply update failed", e instanceof Error ? e.name : "unknown"),
          );
      }
    }
}

/** Moves imported prospects forward when they answer, and honours "BAJA"/"STOP". */
async function recordReply(
  workspaceId: string,
  phone: string,
  date: Date,
  optOut: boolean,
) {
  await prisma.whatsapp_contacts.updateMany({
    where: {
      workspace_id: workspaceId,
      phone,
      stage: { in: [DEFAULT_STAGE, "Contactado"] },
    },
    data: { stage: "Respondió" },
  });
  await prisma.whatsapp_contacts.updateMany({
    where: {
      workspace_id: workspaceId,
      phone,
      OR: [{ last_reply_at: null }, { last_reply_at: { lt: date } }],
    },
    data: { last_reply_at: date },
  });
  if (optOut)
    await prisma.whatsapp_contacts.updateMany({
      where: { workspace_id: workspaceId, phone },
      data: { do_not_contact: true, updated_at: new Date() },
    });
}
