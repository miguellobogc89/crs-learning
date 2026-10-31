import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { accountFor } from "./repository";
import { MetaError } from "./meta";
import { sendMessage } from "./service";
import { bodyParameters, required, uuid, WhatsAppError } from "./rules";
import {
  CAMPAIGN_LIMIT,
  CONTACT_FIELDS,
  mergeForUpdate,
  parseCsv,
  planImport,
  planRecipients,
  type ContactFieldKey,
  type Mapping,
} from "./contacts";

const MAX_IMPORT_ROWS = 20000;

function readMapping(value: unknown, headers: string[]): Mapping {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new WhatsAppError("Asignación de columnas no válida");
  const mapping: Mapping = {};
  const keys = new Set(CONTACT_FIELDS.map((f) => f.key));
  for (const [key, header] of Object.entries(value)) {
    if (!keys.has(key as ContactFieldKey) || typeof header !== "string" || !header) continue;
    if (!headers.includes(header))
      throw new WhatsAppError(`La columna «${header.slice(0, 80)}» no está en el archivo`);
    mapping[key as ContactFieldKey] = header;
  }
  return mapping;
}

export async function importContacts(
  workspaceId: string,
  userId: string,
  input: Record<string, unknown>,
) {
  const csv = required(input.csv, "Archivo", 4_450_000);
  const fileName = required(input.fileName, "Nombre del archivo", 300);
  const { headers, rows } = parseCsv(csv);
  if (!headers.length || !rows.length)
    throw new WhatsAppError("El archivo no tiene filas");
  if (rows.length > MAX_IMPORT_ROWS)
    throw new WhatsAppError(`Máximo ${MAX_IMPORT_ROWS} filas por archivo`);
  const mapping = readMapping(input.mapping, headers);
  let plan;
  try {
    plan = planImport(headers, rows, mapping);
  } catch (e) {
    throw new WhatsAppError(e instanceof Error ? e.message : "Archivo no válido");
  }
  const existing = new Map(
    (
      await prisma.whatsapp_contacts.findMany({
        where: {
          workspace_id: workspaceId,
          external_key: { in: plan.contacts.map((c) => c.external_key) },
        },
        select: {
          id: true,
          external_key: true,
          stage: true,
          do_not_contact: true,
          consent: true,
          consent_source: true,
          consent_at: true,
        },
      })
    ).map((c) => [c.external_key, c]),
  );
  const record = await prisma.whatsapp_contact_imports.create({
    data: {
      workspace_id: workspaceId,
      file_name: fileName,
      mapping: mapping as Prisma.InputJsonValue,
      total: rows.length,
      created: plan.contacts.length - existing.size,
      updated: existing.size,
      skipped: plan.skipped.length,
      created_by: userId,
    },
  });
  const now = new Date();
  const fresh = plan.contacts.filter((c) => !existing.has(c.external_key));
  for (let i = 0; i < fresh.length; i += 500)
    await prisma.whatsapp_contacts.createMany({
      data: fresh.slice(i, i + 500).map((c) => ({
        ...c,
        workspace_id: workspaceId,
        import_id: record.id,
        attributes: c.attributes as Prisma.InputJsonValue,
      })),
      skipDuplicates: true,
    });
  for (const c of plan.contacts) {
    const old = existing.get(c.external_key);
    if (!old) continue;
    const merged = mergeForUpdate(old, c);
    await prisma.whatsapp_contacts.update({
      where: { id: old.id, workspace_id: workspaceId },
      data: {
        ...merged,
        attributes: merged.attributes as Prisma.InputJsonValue,
        import_id: record.id,
        updated_at: now,
      },
    });
  }
  return {
    importId: record.id,
    total: rows.length,
    created: fresh.length,
    updated: existing.size,
    merged: plan.merged,
    skipped: plan.skipped,
    withWhatsapp: plan.withWhatsapp,
    sharedPhones: plan.sharedPhones,
  };
}

const text = (v: string | null, max = 200) => (v ? v.slice(0, max) : "");

export type ContactFilters = {
  q?: string;
  category?: string;
  specialty?: string;
  province?: string;
  city?: string;
  classification?: string;
  stage?: string;
  whatsapp?: string;
  consent?: string;
  contacted?: string;
};

export function filtersFrom(params: URLSearchParams | Record<string, unknown>): ContactFilters {
  const get = (k: string) => {
    const v = params instanceof URLSearchParams ? params.get(k) : params[k];
    return typeof v === "string" ? text(v) : "";
  };
  return {
    q: get("q").slice(0, 100),
    category: get("category"),
    specialty: get("specialty"),
    province: get("province"),
    city: get("city"),
    classification: get("classification"),
    stage: get("stage"),
    whatsapp: get("whatsapp"),
    consent: get("consent"),
    contacted: get("contacted"),
  };
}

/** "__none__" filters rows where the column is empty. */
export function contactWhere(
  workspaceId: string,
  f: ContactFilters,
): Prisma.whatsapp_contactsWhereInput {
  const eq = (v?: string) => (v === "__none__" ? null : v);
  const and: Prisma.whatsapp_contactsWhereInput[] = [];
  for (const key of ["category", "specialty", "province", "city", "classification", "stage"] as const)
    if (f[key]) and.push({ [key]: eq(f[key]) } as Prisma.whatsapp_contactsWhereInput);
  if (f.whatsapp === "yes") and.push({ phone: { not: null } });
  if (f.whatsapp === "no") and.push({ phone: null });
  if (f.consent === "yes") and.push({ consent: true });
  if (f.consent === "no") and.push({ consent: false });
  if (f.contacted === "yes") and.push({ last_contacted_at: { not: null } });
  if (f.contacted === "no") and.push({ last_contacted_at: null });
  if (f.contacted === "replied") and.push({ last_reply_at: { not: null } });
  if (f.contacted === "blocked") and.push({ do_not_contact: true });
  if (f.q) {
    const digits = f.q.replace(/\D/g, "");
    and.push({
      OR: [
        { name: { contains: f.q, mode: "insensitive" } },
        { city: { contains: f.q, mode: "insensitive" } },
        { email: { contains: f.q, mode: "insensitive" } },
        ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
      ],
    });
  }
  return { workspace_id: workspaceId, AND: and };
}

const SORTS: Record<string, (dir: Prisma.SortOrder) => Prisma.whatsapp_contactsOrderByWithRelationInput[]> = {
  name: (dir) => [{ name: dir }],
  rating: (dir) => [{ rating: { sort: dir, nulls: "last" } }, { name: "asc" }],
  city: (dir) => [{ city: { sort: dir, nulls: "last" } }, { name: "asc" }],
  recent: (dir) => [{ last_contacted_at: { sort: dir, nulls: "last" } }, { name: "asc" }],
  reply: (dir) => [{ last_reply_at: { sort: dir, nulls: "last" } }, { name: "asc" }],
  created: (dir) => [{ created_at: dir }, { name: "asc" }],
};

export const contactListSelect = {
  id: true,
  name: true,
  category: true,
  specialty: true,
  city: true,
  province: true,
  phone: true,
  email: true,
  rating: true,
  classification: true,
  stage: true,
  do_not_contact: true,
  consent: true,
  last_contacted_at: true,
  last_reply_at: true,
} as const;

export async function listContacts(workspaceId: string, url: URL) {
  const where = contactWhere(workspaceId, filtersFrom(url.searchParams));
  const sort = SORTS[url.searchParams.get("sort") || ""] || SORTS.name;
  const dir: Prisma.SortOrder = url.searchParams.get("dir") === "desc" ? "desc" : "asc";
  const offset = Math.max(0, Math.min(1_000_000, Math.floor(Number(url.searchParams.get("offset")) || 0)));
  const [items, total, all] = await Promise.all([
    prisma.whatsapp_contacts.findMany({
      where,
      select: contactListSelect,
      orderBy: [...sort(dir), { id: "asc" }],
      take: 50,
      skip: offset,
    }),
    prisma.whatsapp_contacts.count({ where }),
    prisma.whatsapp_contacts.count({ where: { workspace_id: workspaceId } }),
  ]);
  const accountId = url.searchParams.get("accountId");
  const phones = items.map((c) => c.phone).filter((p): p is string => Boolean(p));
  const conversations =
    accountId && phones.length
      ? await prisma.whatsapp_conversations.findMany({
          where: { workspace_id: workspaceId, account_id: uuid(accountId), contact_phone: { in: phones } },
          select: { id: true, contact_phone: true, unread_count: true, last_message_at: true },
        })
      : [];
  const byPhone = new Map(conversations.map((c) => [c.contact_phone, c]));
  return {
    items: items.map((c) => ({ ...c, conversation: (c.phone && byPhone.get(c.phone)) || null })),
    total,
    all,
  };
}

export async function contactFacets(workspaceId: string) {
  const fields = ["category", "specialty", "province", "city", "classification", "stage"] as const;
  // Prisma cannot type groupBy over a union of keys, so the call is narrowed by hand.
  const groupBy = prisma.whatsapp_contacts.groupBy as unknown as (args: {
    by: string[];
    where: Prisma.whatsapp_contactsWhereInput;
    _count: { _all: true };
  }) => Promise<Record<string, unknown>[]>;
  const groups = await Promise.all(
    fields.map((by) =>
      groupBy({ by: [by], where: { workspace_id: workspaceId }, _count: { _all: true } }),
    ),
  );
  const facets: Record<string, { value: string | null; count: number }[]> = {};
  fields.forEach((field, i) => {
    facets[field] = groups[i]
      .map((g) => ({
        value: (g[field] as string | null) ?? null,
        count: (g._count as { _all: number })._all,
      }))
      .sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)));
  });
  const columns = await prisma.$queryRaw<{ key: string }[]>`
    SELECT DISTINCT jsonb_object_keys(attributes) AS key
    FROM whatsapp_contacts WHERE workspace_id = ${workspaceId}::uuid LIMIT 200`;
  return { facets, columns: columns.map((c) => c.key).sort() };
}

export async function contactIds(workspaceId: string, url: URL) {
  const items = await prisma.whatsapp_contacts.findMany({
    where: contactWhere(workspaceId, filtersFrom(url.searchParams)),
    select: { id: true },
    orderBy: { name: "asc" },
    take: 5001,
  });
  if (items.length > 5000)
    throw new WhatsAppError("Demasiados contactos: filtra la lista a 5.000 o menos");
  return items.map((c) => c.id);
}

export async function getContact(workspaceId: string, id: string, accountId: string | null) {
  const contact = await prisma.whatsapp_contacts.findFirst({
    where: { workspace_id: workspaceId, id },
  });
  if (!contact) throw new WhatsAppError("Contacto no encontrado", 404);
  const conversation =
    accountId && contact.phone
      ? await prisma.whatsapp_conversations.findFirst({
          where: { workspace_id: workspaceId, account_id: uuid(accountId), contact_phone: contact.phone },
        })
      : null;
  const sharedWith = contact.phone
    ? await prisma.whatsapp_contacts.findMany({
        where: { workspace_id: workspaceId, phone: contact.phone, id: { not: contact.id } },
        select: { id: true, name: true },
        take: 10,
      })
    : [];
  const campaigns = await prisma.whatsapp_campaign_recipients.findMany({
    where: { workspace_id: workspaceId, contact_id: contact.id },
    orderBy: { updated_at: "desc" },
    take: 20,
    select: { campaign_id: true, status: true, reason: true, error: true, updated_at: true },
  });
  const names = new Map(
    (
      await prisma.whatsapp_campaigns.findMany({
        where: { workspace_id: workspaceId, id: { in: campaigns.map((c) => c.campaign_id) } },
        select: { id: true, template_name: true },
      })
    ).map((c) => [c.id, c.template_name]),
  );
  return {
    item: contact,
    conversation,
    sharedWith,
    sends: campaigns.map((c) => ({ ...c, template_name: names.get(c.campaign_id) || "" })),
  };
}

function optionalText(value: unknown, label: string, max: number) {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || value.length > max) throw new WhatsAppError(`${label} no válido`);
  return value.trim() || null;
}

export async function updateContacts(workspaceId: string, input: Record<string, unknown>) {
  const ids = Array.isArray(input.ids) ? input.ids.map(uuid) : [uuid(input.id)];
  if (!ids.length || ids.length > 5000) throw new WhatsAppError("Selección no válida");
  const data: Prisma.whatsapp_contactsUpdateManyMutationInput = { updated_at: new Date() };
  if ("stage" in input) data.stage = required(input.stage, "Seguimiento", 60);
  if ("classification" in input) data.classification = optionalText(input.classification, "Clasificación", 60);
  if ("notes" in input) data.notes = optionalText(input.notes, "Notas", 5000);
  if ("do_not_contact" in input) {
    if (typeof input.do_not_contact !== "boolean") throw new WhatsAppError("Valor no válido");
    data.do_not_contact = input.do_not_contact;
  }
  if ("consent" in input) {
    if (typeof input.consent !== "boolean") throw new WhatsAppError("Valor no válido");
    data.consent = input.consent;
    data.consent_source = input.consent
      ? optionalText(input.consent_source, "Fuente del permiso", 300) || "Marcado en la app"
      : null;
    data.consent_at = input.consent ? new Date() : null;
  }
  const result = await prisma.whatsapp_contacts.updateMany({
    where: { workspace_id: workspaceId, id: { in: ids } },
    data,
  });
  return { updated: result.count };
}

export async function deleteContacts(workspaceId: string, input: Record<string, unknown>) {
  const ids = Array.isArray(input.ids) ? input.ids.map(uuid) : [];
  if (!ids.length || ids.length > 5000) throw new WhatsAppError("Selección no válida");
  const result = await prisma.whatsapp_contacts.deleteMany({
    where: { workspace_id: workspaceId, id: { in: ids } },
  });
  return { deleted: result.count };
}

// ---------- Bulk template sends ----------

const SOURCE = /^(field:(name|category|specialty|city|province|email|website)|attr:.{1,200}|text:.{1,200})$/s;

async function campaignInput(workspaceId: string, input: Record<string, unknown>) {
  const accountId = uuid(input.accountId);
  await accountFor(workspaceId, accountId);
  const template = await prisma.whatsapp_templates.findFirst({
    where: { id: uuid(input.templateId), workspace_id: workspaceId, account_id: accountId, status: "APPROVED" },
  });
  if (!template) throw new WhatsAppError("Selecciona una plantilla aprobada de este número");
  const components = template.components as unknown as { type: string; text?: string }[];
  if (components.some((c) => c.type !== "BODY" && c.type !== "FOOTER"))
    throw new WhatsAppError("El envío masivo admite plantillas de texto con cuerpo y pie");
  const count = bodyParameters(components.find((c) => c.type === "BODY")?.text || "");
  const variables = Array.isArray(input.variables) ? input.variables : [];
  if (variables.length !== count || variables.some((v) => typeof v !== "string" || !SOURCE.test(v)))
    throw new WhatsAppError("Indica de dónde sale cada variable de la plantilla");
  const ids = Array.isArray(input.contactIds) ? [...new Set(input.contactIds.map(uuid))] : [];
  if (!ids.length) throw new WhatsAppError("Selecciona al menos un contacto");
  if (ids.length > 1000) throw new WhatsAppError("Selecciona 1.000 contactos o menos");
  const contacts = await prisma.whatsapp_contacts.findMany({
    where: { workspace_id: workspaceId, id: { in: ids } },
    orderBy: [{ rating: { sort: "desc", nulls: "last" } }, { name: "asc" }],
  });
  const plan = planRecipients(contacts, variables as string[], {
    excludeContacted: input.excludeContacted !== false,
  });
  const body = components.find((c) => c.type === "BODY")?.text || "";
  return { accountId, template, variables: variables as string[], plan, body };
}

function summarize(plan: ReturnType<typeof planRecipients>, body: string) {
  const ready = plan.filter((p) => !p.reason);
  const reasons: Record<string, number> = {};
  for (const p of plan) if (p.reason) reasons[p.reason] = (reasons[p.reason] || 0) + 1;
  const sample = ready[0];
  return {
    total: plan.length,
    ready: ready.length,
    withoutConsent: ready.filter((p) => !p.contact.consent).length,
    overLimit: Math.max(0, ready.length - CAMPAIGN_LIMIT),
    limit: CAMPAIGN_LIMIT,
    reasons,
    sample: sample
      ? {
          name: sample.contact.name,
          text: body.replace(/\{\{(\d+)\}\}/g, (_, n) => sample.parameters[Number(n) - 1] || ""),
        }
      : null,
  };
}

export async function previewCampaign(workspaceId: string, input: Record<string, unknown>) {
  const { plan, body } = await campaignInput(workspaceId, input);
  return summarize(plan, body);
}

export async function createCampaign(workspaceId: string, userId: string, input: Record<string, unknown>) {
  const { accountId, template, variables, plan, body } = await campaignInput(workspaceId, input);
  const summary = summarize(plan, body);
  if (!summary.ready) throw new WhatsAppError("Ningún contacto seleccionado puede recibir esta plantilla");
  if (summary.overLimit)
    throw new WhatsAppError(`Máximo ${CAMPAIGN_LIMIT} envíos por tanda. Reduce la selección.`);
  if (summary.withoutConsent && input.acknowledgeNoConsent !== true)
    throw new WhatsAppError("Confirma el envío a contactos sin autorización registrada", 409);
  const campaign = await prisma.$transaction(async (tx) => {
    const created = await tx.whatsapp_campaigns.create({
      data: {
        workspace_id: workspaceId,
        account_id: accountId,
        template_id: template.id,
        template_name: template.name,
        variables,
        created_by: userId,
      },
    });
    await tx.whatsapp_campaign_recipients.createMany({
      data: plan.map((p) => ({
        workspace_id: workspaceId,
        campaign_id: created.id,
        contact_id: p.contact.id,
        phone: p.contact.phone,
        parameters: p.parameters,
        status: p.reason ? "skipped" : "pending",
        reason: p.reason,
      })),
    });
    return created;
  });
  return { campaignId: campaign.id, ...(await campaignProgress(workspaceId, campaign.id)) };
}

export async function campaignProgress(workspaceId: string, campaignId: string) {
  const groups = await prisma.whatsapp_campaign_recipients.groupBy({
    by: ["status"],
    where: { workspace_id: workspaceId, campaign_id: campaignId },
    _count: { _all: true },
  });
  const counts: Record<string, number> = { pending: 0, sending: 0, sent: 0, failed: 0, unknown: 0, skipped: 0 };
  for (const g of groups) counts[g.status] = g._count._all;
  const failures = await prisma.whatsapp_campaign_recipients.findMany({
    where: { workspace_id: workspaceId, campaign_id: campaignId, status: { in: ["failed", "unknown"] } },
    select: { contact_id: true, error: true },
    take: 20,
  });
  return { counts, done: counts.pending === 0 && counts.sending === 0, failures };
}

/** Sends the next few pending recipients. The client calls it repeatedly to show progress. */
export async function runCampaign(workspaceId: string, input: Record<string, unknown>, batch = 8) {
  const campaign = await prisma.whatsapp_campaigns.findFirst({
    where: { workspace_id: workspaceId, id: uuid(input.campaignId) },
  });
  if (!campaign) throw new WhatsAppError("Envío no encontrado", 404);
  // A run interrupted mid-send leaves rows in "sending"; retrying is safe because the
  // recipient id is the message request id, so Meta is never called twice for it.
  await prisma.whatsapp_campaign_recipients.updateMany({
    where: {
      workspace_id: workspaceId,
      campaign_id: campaign.id,
      status: "sending",
      updated_at: { lt: new Date(Date.now() - 120000) },
    },
    data: { status: "pending" },
  });
  const pending = await prisma.whatsapp_campaign_recipients.findMany({
    where: { workspace_id: workspaceId, campaign_id: campaign.id, status: "pending" },
    orderBy: { id: "asc" },
    take: batch,
  });
  for (const r of pending) {
    // Claim the row so a parallel run cannot send it too; the request id makes a resend impossible anyway.
    const claimed = await prisma.whatsapp_campaign_recipients.updateMany({
      where: { id: r.id, status: "pending" },
      data: { status: "sending", updated_at: new Date() },
    });
    if (!claimed.count) continue;
    const contact = await prisma.whatsapp_contacts.findFirst({
      where: { workspace_id: workspaceId, id: r.contact_id },
    });
    if (!contact || contact.do_not_contact || contact.phone !== r.phone) {
      await prisma.whatsapp_campaign_recipients.update({
        where: { id: r.id },
        data: { status: "skipped", reason: "do_not_contact", updated_at: new Date() },
      });
      continue;
    }
    let status = "sent",
      error: string | null = null;
    try {
      const message = await sendMessage(workspaceId, {
        requestId: r.id,
        accountId: campaign.account_id,
        to: contact.phone,
        templateId: campaign.template_id,
        parameters: r.parameters,
      });
      if (message && ["failed", "unknown"].includes(message.status)) {
        status = message.status;
        error = message.error;
      }
    } catch (e) {
      // MetaError is a definitive rejection; any other 502 means Meta's answer never arrived.
      status =
        !(e instanceof MetaError) && e instanceof WhatsAppError && e.status === 502
          ? "unknown"
          : "failed";
      error = e instanceof WhatsAppError ? e.message : "Error al enviar";
    }
    await prisma.whatsapp_campaign_recipients.update({
      where: { id: r.id },
      data: { status, error, updated_at: new Date() },
    });
    // sendMessage already moved the contact to "Contactado"; name the new conversation after the business.
    if (status !== "failed") {
      await prisma.whatsapp_conversations.updateMany({
        where: {
          workspace_id: workspaceId,
          account_id: campaign.account_id,
          contact_phone: contact.phone!,
          contact_name: null,
        },
        data: { contact_name: contact.name.slice(0, 200) },
      });
    }
  }
  return campaignProgress(workspaceId, campaign.id);
}
