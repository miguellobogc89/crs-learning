import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createHmac } from "node:crypto";
import { connectorKey, encrypt } from "@/lib/connectors/crypto";
import { accountFor, conversationFor } from "./repository";
import { graph, listTemplates, metaConfig, MetaError, type MetaTemplate } from "./meta";
import {
  bodyParameters,
  metaId,
  phone,
  required,
  serviceWindow,
  uuid,
  WhatsAppError,
} from "./rules";

/**
 * The end of Meta's signup. Meta normally says which account and number were chosen; some flows (a number Meta
 * provides, an account without a number yet, a lost browser message) only say the account, or nothing. Then the
 * accounts this authorization covers are read from Meta itself, and every number in them is connected.
 */
export async function connectFromSignup(workspaceId: string, token: string, input: Record<string, unknown>) {
  if (input.wabaId && input.phoneNumberId) return [await connectNumber(workspaceId, token, input)];
  const wabaIds = input.wabaId ? [metaId(input.wabaId)] : await authorizedWabas(token);
  if (!wabaIds.length) throw new WhatsAppError("Meta no ha dado acceso a ninguna cuenta de WhatsApp. Vuelve a conectar y elige la cuenta.", 422);
  const results = [];
  for (const wabaId of wabaIds) {
    const numbers = await graph<{ data: { id: string }[] }>(`${wabaId}/phone_numbers?fields=id&limit=100`, token);
    for (const n of numbers.data) results.push(await connectNumber(workspaceId, token, { wabaId, phoneNumberId: n.id }));
  }
  if (!results.length) throw new WhatsAppError("La cuenta de WhatsApp no tiene ningún número todavía. Añádelo en WhatsApp Manager o vuelve a conectar.", 422);
  return results;
}

/** WhatsApp accounts the token was granted (Meta's debug_token, read with the app's own credentials). */
async function authorizedWabas(token: string): Promise<string[]> {
  const c = metaConfig();
  const info = await graph<{ data?: { granular_scopes?: { scope: string; target_ids?: string[] }[] } }>(
    `debug_token?input_token=${encodeURIComponent(token)}`, `${c.appId}|${c.secret}`);
  const ids = info.data?.granular_scopes?.filter(s => s.scope === "whatsapp_business_management" || s.scope === "whatsapp_business_messaging")
    .flatMap(s => s.target_ids ?? []) ?? [];
  return [...new Set(ids)].filter(id => /^\d+$/.test(id));
}

/** Stable 6-digit two-step PIN per number, derived from the server key: nothing extra to store, same on retries. */
export function registrationPin(phoneNumberId: string, key: Buffer = connectorKey()) {
  const n = createHmac("sha256", key).update(`whatsapp-pin:${phoneNumberId}`).digest().readUInt32BE(0) % 1_000_000;
  return String(n).padStart(6, "0");
}

/**
 * Registers the number for Cloud API (Meta asks the partner to do it within 90 days; until then it cannot send).
 * Registering again with the same PIN is harmless. A failure does not undo the connection: it is reported.
 */
export async function registerNumber(token: string, phoneNumberId: string): Promise<string | null> {
  try {
    await graph(`${phoneNumberId}/register`, token, "POST", { messaging_product: "whatsapp", pin: registrationPin(phoneNumberId) });
    return null;
  } catch (error) {
    const code = error instanceof MetaError ? error.code : 0;
    console.error("[whatsapp] register failed", code);
    return code === 133005
      ? "El número tiene un PIN de verificación en dos pasos distinto. Quítalo en WhatsApp Manager y pulsa «Registrar»."
      : `Meta no ha registrado el número todavía (código ${code || "desconocido"}). Pulsa «Registrar» más tarde.`;
  }
}

export async function registerAccount(workspaceId: string, accountId: string) {
  const account = await accountFor(workspaceId, accountId);
  const problem = await registerNumber(account.token, account.phone_number_id);
  if (problem) throw new WhatsAppError(problem, 502);
}

export async function connectNumber(
  workspaceId: string,
  token: string,
  input: Record<string, unknown>,
) {
  const wabaId = metaId(input.wabaId),
    phoneId = metaId(input.phoneNumberId);
  // Verify the number belongs to this WABA using Meta, never trust the browser's display data.
  let after = "",
    found:
      | { id: string; display_phone_number: string; verified_name?: string }
      | undefined;
  do {
    const page = await graph<{
      data: {
        id: string;
        display_phone_number: string;
        verified_name?: string;
      }[];
      paging?: { next?: string; cursors?: { after?: string } };
    }>(
      `${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name&limit=100${after ? `&after=${encodeURIComponent(after)}` : ""}`,
      token,
    );
    found = page.data.find((p) => p.id === phoneId);
    after = !found && page.paging?.next ? page.paging.cursors?.after || "" : "";
  } while (after);
  if (!found)
    throw new WhatsAppError(
      "El número no pertenece a la cuenta de WhatsApp autorizada",
      403,
    );
  const existing = await prisma.whatsapp_accounts.findUnique({
    where: { phone_number_id: phoneId },
  });
  if (existing && existing.workspace_id !== workspaceId)
    throw new WhatsAppError("Este número ya está asociado a otro espacio", 409);
  await graph(`${wabaId}/subscribed_apps`, token, "POST", {});
  const data = {
    waba_id: wabaId,
    display_phone: found.display_phone_number,
    verified_name: found.verified_name || null,
    token_enc: encrypt(token),
    status: "active",
    updated_at: new Date(),
  };
  // Conditional update prevents another workspace from claiming a number during a concurrent connection.
  if (existing)
    await prisma.whatsapp_accounts.update({
      where: { id: existing.id, workspace_id: workspaceId },
      data,
    });
  else
    await prisma.whatsapp_accounts.create({
      data: { workspace_id: workspaceId, phone_number_id: phoneId, ...data },
    });
  return { phone: found.display_phone_number, registerProblem: await registerNumber(token, phoneId) };
}

export async function syncTemplates(workspaceId: string, accountId: string) {
  const startedAt = new Date();
  const account = await accountFor(workspaceId, accountId);
  const templates = await listTemplates(account.waba_id, account.token);
  await prisma.$transaction(
    async (tx) => {
      for (const t of templates) {
        const data = {
          name: t.name,
          language: t.language,
          category: t.category,
          status: t.status,
          components: t.components as Prisma.InputJsonValue,
          updated_at: new Date(),
        };
        await tx.whatsapp_templates.upsert({
          where: {
            account_id_provider_id: {
              account_id: accountId,
              provider_id: t.id,
            },
          },
          create: {
            workspace_id: workspaceId,
            account_id: accountId,
            provider_id: t.id,
            ...data,
          },
          update: data,
        });
      }
      await tx.whatsapp_templates.deleteMany({
        where: {
          workspace_id: workspaceId,
          account_id: accountId,
          provider_id: { notIn: templates.map((t) => t.id) },
          updated_at: { lt: startedAt },
        },
      });
    },
    { timeout: 30000 },
  );
}
export async function createTemplate(
  workspaceId: string,
  input: Record<string, unknown>,
) {
  const accountId = uuid(input.accountId),
    account = await accountFor(workspaceId, accountId);
  const name = required(input.name, "Nombre", 512),
    language = required(input.language, "Idioma", 10),
    text = required(input.text, "Texto", 1024);
  if (
    !/^[a-z][a-z0-9_]*$/.test(name) ||
    !/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(language)
  )
    throw new WhatsAppError("Nombre o idioma no válido");
  if (!["MARKETING", "UTILITY"].includes(String(input.category)))
    throw new WhatsAppError("Categoría no válida");
  const count = bodyParameters(text);
  const examples = Array.isArray(input.examples)
    ? input.examples.map((v) => required(v, "Ejemplo", 200))
    : [];
  if (examples.length !== count)
    throw new WhatsAppError("Añade un ejemplo por variable");
  const footer = typeof input.footer === "string" && input.footer.trim() ? required(input.footer, "Pie", 60) : null;
  if (footer && /\{\{/.test(footer)) throw new WhatsAppError("El pie no admite variables");
  const components = [
    {
      type: "BODY",
      text,
      ...(count ? { example: { body_text: [examples] } } : {}),
    },
    ...(footer ? [{ type: "FOOTER", text: footer }] : []),
  ];
  const created = await graph<{ id: string; status: string }>(
    `${account.waba_id}/message_templates`,
    account.token,
    "POST",
    { name, language, category: input.category, components },
  );
  await prisma.whatsapp_templates.create({
    data: {
      workspace_id: workspaceId,
      account_id: accountId,
      provider_id: created.id,
      name,
      language,
      category: String(input.category),
      status: created.status,
      components,
    },
  });
}

export async function sendMessage(
  workspaceId: string,
  input: Record<string, unknown>,
) {
  const requestId = uuid(input.requestId);
  const existing = await prisma.whatsapp_messages.findUnique({
    where: {
      workspace_id_request_id: {
        workspace_id: workspaceId,
        request_id: requestId,
      },
    },
  });
  if (existing) return existing; // Repeated browser requests never call Meta twice.
  let conversation;
  if (input.conversationId)
    conversation = await conversationFor(
      workspaceId,
      uuid(input.conversationId),
    );
  else {
    const accountId = uuid(input.accountId),
      contactPhone = phone(input.to);
    await accountFor(workspaceId, accountId);
    if (!input.templateId)
      throw new WhatsAppError(
        "Inicia la conversación con una plantilla aprobada",
      );
    conversation = await prisma.whatsapp_conversations.upsert({
      where: {
        account_id_contact_phone: {
          account_id: accountId,
          contact_phone: contactPhone,
        },
      },
      create: {
        workspace_id: workspaceId,
        account_id: accountId,
        contact_phone: contactPhone,
      },
      update: {},
    });
  }
  const account = await accountFor(workspaceId, conversation.account_id);
  let payload: Record<string, unknown>, display: string, kind: string;
  if (input.templateId) {
    const template = await prisma.whatsapp_templates.findFirst({
      where: {
        id: uuid(input.templateId),
        workspace_id: workspaceId,
        account_id: account.id,
        status: "APPROVED",
      },
    });
    if (!template)
      throw new WhatsAppError(
        "Selecciona una plantilla aprobada de este número",
      );
    const components =
      template.components as unknown as MetaTemplate["components"];
    // Advanced media/header/button templates are visible but cannot be sent with missing required parameters.
    if (components.some((c) => c.type !== "BODY" && c.type !== "FOOTER"))
      throw new WhatsAppError(
        "Este envío admite plantillas de texto con cuerpo y pie",
      );
    const body = components.find((c) => c.type === "BODY")?.text || "";
    const count = bodyParameters(body);
    const values = Array.isArray(input.parameters)
      ? input.parameters.map((v) => required(v, "Variable", 1024))
      : [];
    if (values.length !== count)
      throw new WhatsAppError("Completa todas las variables de la plantilla");
    display = body.replace(/\{\{(\d+)\}\}/g, (_, n) => values[Number(n) - 1]);
    kind = "template";
    payload = {
      type: "template",
      template: {
        name: template.name,
        language: { code: template.language },
        ...(count
          ? {
              components: [
                {
                  type: "body",
                  parameters: values.map((text) => ({ type: "text", text })),
                },
              ],
            }
          : {}),
      },
    };
  } else {
    if (!serviceWindow(conversation.last_inbound_at))
      throw new WhatsAppError(
        "Fuera de la ventana de 24 horas: utiliza una plantilla aprobada",
        422,
      );
    display = required(input.text, "Mensaje");
    kind = "text";
    payload = { type: "text", text: { body: display } };
  }
  let message;
  try {
    message = await prisma.whatsapp_messages.create({
      data: {
        workspace_id: workspaceId,
        conversation_id: conversation.id,
        request_id: requestId,
        direction: "out",
        kind,
        text: display,
        status: "sending",
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      return prisma.whatsapp_messages.findUnique({
        where: {
          workspace_id_request_id: {
            workspace_id: workspaceId,
            request_id: requestId,
          },
        },
      });
    throw error;
  }
  try {
    const result = await graph<{ messages?: { id: string }[] }>(
      `${account.phone_number_id}/messages`,
      account.token,
      "POST",
      {
        messaging_product: "whatsapp",
        to: conversation.contact_phone,
        biz_opaque_callback_data: message.id,
        ...payload,
      },
    );
    if (!result.messages?.[0]?.id)
      throw new Error("Missing provider message id");
    await prisma.$transaction([
      prisma.whatsapp_messages.updateMany({
        where: { id: message.id, status: "sending" },
        data: { provider_id: result.messages[0].id, status: "sent" },
      }),
      prisma.whatsapp_conversations.update({
        where: { id: conversation.id },
        data: { last_message_at: new Date() },
      }),
    ]);
    await markContacted(workspaceId, conversation.contact_phone);
    return { ...message, status: "sent" };
  } catch (error) {
    const definitive = error instanceof MetaError;
    await prisma.whatsapp_messages.updateMany({
      where: { id: message.id, status: "sending" },
      data: {
        status: definitive ? "failed" : "unknown",
        error: definitive
          ? error.message
          : "No se pudo confirmar el envío. Comprueba la conversación antes de volver a enviar.",
      },
    });
    if (definitive) throw error;
    throw new WhatsAppError(
      "Envío sin confirmar. No se reintentará automáticamente para evitar duplicados.",
      502,
    );
  }
}

/** Imported prospects with this phone move from "Sin contactar" to "Contactado". Best effort. */
async function markContacted(workspaceId: string, contactPhone: string) {
  try {
    const now = new Date();
    await prisma.whatsapp_contacts.updateMany({
      where: { workspace_id: workspaceId, phone: contactPhone, stage: "Sin contactar" },
      data: { stage: "Contactado" },
    });
    await prisma.whatsapp_contacts.updateMany({
      where: { workspace_id: workspaceId, phone: contactPhone },
      data: { last_contacted_at: now },
    });
  } catch (error) {
    console.error("[whatsapp] Contact update after send failed", error instanceof Error ? error.name : "unknown");
  }
}
