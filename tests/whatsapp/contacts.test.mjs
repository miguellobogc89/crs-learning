import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url);
function load(path, dependencies = {}) {
  const m = { exports: {} };
  const code = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "module", "exports", code)(
    (name) => {
      if (name in dependencies) return dependencies[name];
      if (name === "server-only") return {};
      if (name.startsWith("node:")) return require(name);
      throw Error(`Missing test dependency: ${name}`);
    },
    m,
    m.exports,
  );
  return m.exports;
}
const rules = load("lib/whatsapp/rules.ts");
const contacts = load("lib/whatsapp/contacts.ts");
const ws = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ids = (n) => `dddddddd-dddd-4ddd-8ddd-${String(n).padStart(12, "0")}`;

// Same layout as the client's prospect directory, with invented businesses.
const maps = (a) =>
  `https://www.google.com/maps/place/X/data=!4m7!3m6!1s0x12a4a3d32b56715${a}:0xe593cdc28ca39bc${a}!8m2!3d41.6!4d1.7`;
const CSV =
  "﻿Empresa,Categoría,Especialidad,Servicio,Dirección,Localidad,Provincia,Teléfono fijo,Teléfono móvil,WhatsApp confirmado,Email comercial,Sitio web,Estrellas,Reseñas,Clasificación,Google Maps,Autorización,Fuente del permiso,Fecha de autorización,No contactar,Seguimiento,Campo (Cuerpo)\r\n" +
  `Sonido Uno,Música en directo y DJ,DJ y discomóviles,DJ,,Barcelona,,,+34611000001,,uno@example.com,https://uno.example,,Por comprobar,Revisar,${maps(1)},No,,,No,Sin contactar,Frase uno\r\n` +
  `"Fiestas Dos, Bodas y Eventos",Música en directo y DJ,DJ y discomóviles,DJ,"Calle Mayor, 1, 08001 Barcelona",Barcelona,Barcelona,+34931000002,,https://wa.me/622000002,,,"4,7",Sí,Revisar,"${maps(2)}",Sí,Formulario web,15/09/2026,No,Sin contactar,Frase dos\r\n` +
  `Fiestas Dos duplicada,Música en directo y DJ,DJ y discomóviles,DJ,,Barcelona,,,+34611000001,,,,5.0,Por comprobar,Revisar,${maps(3)},No,,,No,Sin contactar,\r\n` +
  `Magia Tres,Espectáculos y artistas,"Magos, mentalistas e hipnotistas",Mago,,A Coruña,A Coruña,+34981000003,,,,,2.0,Por comprobar,Descartada,${maps(4)},No,,,Sí,Sin contactar,\r\n` +
  `,Música en directo y DJ,DJ y discomóviles,DJ,,Barcelona,,,+34611000009,,,,,,,,No,,,No,Sin contactar,\r\n` +
  `Sonido Uno (repetida),Música en directo y DJ,DJ y discomóviles,DJ,,Barcelona,,,+34611000001,,,,,,Revisar,${maps(1)},No,,,No,Sin contactar,\r\n`;

test("CSV parser keeps quoted commas, BOM, CRLF and semicolon files", () => {
  const { headers, rows } = contacts.parseCsv(CSV);
  assert.equal(headers[0], "Empresa");
  assert.equal(headers.length, 22);
  assert.equal(rows.length, 6);
  assert.equal(rows[1][0], "Fiestas Dos, Bodas y Eventos");
  assert.equal(rows[1][4], "Calle Mayor, 1, 08001 Barcelona");
  const semi = contacts.parseCsv('Nombre;Móvil\n"A; B";600000000\n\n');
  assert.deepEqual(semi.rows, [["A; B", "600000000"]]);
  assert.deepEqual(contacts.parseCsv('a,b\n"x ""y""",2').rows, [['x "y"', "2"]]);
});

test("column detection recognises the prospect directory headers", () => {
  const { headers } = contacts.parseCsv(CSV);
  const m = contacts.detectMapping(headers);
  assert.equal(m.name, "Empresa");
  assert.equal(m.mobile, "Teléfono móvil");
  assert.equal(m.landline, "Teléfono fijo");
  assert.equal(m.whatsapp, "WhatsApp confirmado");
  assert.equal(m.classification, "Clasificación");
  assert.equal(m.consent, "Autorización");
  assert.equal(m.do_not_contact, "No contactar");
  assert.equal(m.stage, "Seguimiento");
  assert.equal(m.rating, "Estrellas");
  assert.ok(!Object.values(m).includes("Campo (Cuerpo)"));
});

test("phones are normalised to WhatsApp format; landlines and text are not guessed", () => {
  assert.equal(contacts.normalizePhone("+34 615 33 34 35"), "34615333435");
  assert.equal(contacts.normalizePhone("https://wa.me/621347542"), "34621347542");
  assert.equal(contacts.normalizePhone("https://wa.me/34644121373"), "34644121373");
  assert.equal(contacts.normalizePhone("0034 600 000 000"), "34600000000");
  assert.equal(contacts.normalizePhone("600000000"), "34600000000");
  assert.equal(contacts.normalizePhone("+1 (415) 555-0100"), "14155550100");
  assert.equal(contacts.normalizePhone("Por comprobar"), null);
  assert.equal(contacts.normalizePhone(""), null);
  assert.equal(contacts.normalizePhone("12345"), null);
});

test("import plan merges repeated places, prefers confirmed WhatsApp and flags shared phones", () => {
  const { headers, rows } = contacts.parseCsv(CSV);
  const plan = contacts.planImport(headers, rows, contacts.detectMapping(headers));
  assert.equal(plan.contacts.length, 4);
  assert.equal(plan.merged, 1);
  assert.deepEqual(plan.skipped, [{ row: 6, reason: "Sin nombre de empresa" }]);
  const [uno, dos, dup, magia] = plan.contacts;
  assert.equal(uno.name, "Sonido Uno (repetida)", "later row for the same place wins");
  assert.match(uno.external_key, /^maps:0x/);
  assert.equal(dos.phone, "34622000002", "WhatsApp column beats the landline");
  assert.equal(dos.rating, 4.7);
  assert.equal(dos.consent, true);
  assert.equal(dos.consent_source, "Formulario web");
  assert.equal(dos.consent_at.toISOString().slice(0, 10), "2026-09-15");
  assert.equal(dos.attributes["Campo (Cuerpo)"], "Frase dos");
  assert.equal(dos.attributes["Teléfono fijo"], "+34931000002");
  assert.equal(magia.phone, null, "a landline alone is not a WhatsApp number");
  assert.equal(magia.do_not_contact, true);
  assert.equal(magia.classification, "Descartada");
  assert.deepEqual(plan.sharedPhones, [{ phone: "34611000001", names: ["Sonido Uno (repetida)", "Fiestas Dos duplicada"] }]);
  assert.equal(plan.withWhatsapp, 3);
  assert.equal(dup.stage, "Sin contactar");
  assert.throws(() => contacts.planImport(headers, rows, {}), /nombre/);
});

test("re-import never undoes app work: opt-outs, consent and advanced stages stay", () => {
  const { headers, rows } = contacts.parseCsv(CSV);
  const incoming = contacts.planImport(headers, rows, contacts.detectMapping(headers)).contacts[0];
  const merged = contacts.mergeForUpdate(
    { stage: "Interesado", do_not_contact: true, consent: true, consent_source: "Llamada", consent_at: new Date("2026-01-01") },
    incoming,
  );
  assert.equal(merged.stage, "Interesado");
  assert.equal(merged.do_not_contact, true);
  assert.equal(merged.consent, true);
  assert.equal(merged.consent_source, "Llamada");
  assert.equal(merged.name, incoming.name);
  const moved = contacts.mergeForUpdate(
    { stage: "Sin contactar", do_not_contact: false, consent: false, consent_source: null, consent_at: null },
    { ...incoming, stage: "Cliente" },
  );
  assert.equal(moved.stage, "Cliente", "a stage set in the file is taken when the app had none");
});

test("recipient plan skips opt-outs, discarded, repeated phones and missing variables", () => {
  const base = { do_not_contact: false, consent: false, classification: "Revisar", stage: "Sin contactar", last_contacted_at: null, city: "Barcelona" };
  const list = [
    { ...base, id: ids(1), name: "A", phone: "34600000001", attributes: { "Campo (Cuerpo)": "Hola A" } },
    { ...base, id: ids(2), name: "B", phone: null },
    { ...base, id: ids(3), name: "C", phone: "34600000003", do_not_contact: true },
    { ...base, id: ids(4), name: "D", phone: "34600000004", classification: "Descartada" },
    { ...base, id: ids(5), name: "E", phone: "34600000001", attributes: { "Campo (Cuerpo)": "Hola E" } },
    { ...base, id: ids(6), name: "F", phone: "34600000006", attributes: {} },
    { ...base, id: ids(7), name: "G", phone: "34600000007", last_contacted_at: new Date(), attributes: { "Campo (Cuerpo)": "x" } },
  ];
  const plan = contacts.planRecipients(list, ["field:name", "attr:Campo (Cuerpo)", "text:Fijo"], { excludeContacted: true });
  assert.deepEqual(
    plan.map((p) => p.reason),
    [null, "no_phone", "do_not_contact", "discarded", "duplicate_phone", "missing_variable", "already_contacted"],
  );
  assert.deepEqual(plan[0].parameters, ["A", "Hola A", "Fijo"]);
  const again = contacts.planRecipients(list.slice(6), ["field:name"], { excludeContacted: false });
  assert.equal(again[0].reason, null);
});

test("opt-out answers are recognised without catching normal replies", () => {
  for (const t of ["BAJA", "baja.", "Stop", "¡Darme de baja!", "no quiero más mensajes"]) assert.equal(contacts.isOptOut(t), true, t);
  for (const t of ["Hola, ¿qué precio tiene?", "No puedo hoy, mañana sí", "bajamos el viernes"]) assert.equal(contacts.isOptOut(t), false, t);
});

function campaignService(state) {
  const sent = [];
  const meta = load("lib/whatsapp/meta.ts", { "./rules": rules });
  const prisma = {
    whatsapp_campaigns: {
      findFirst: async ({ where }) => (where.workspace_id === ws ? state.campaign : null),
      create: async ({ data }) => ({ id: ids(900), ...data }),
    },
    whatsapp_campaign_recipients: {
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (const r of state.recipients)
          if ((!where.id || r.id === where.id) && (!where.status || r.status === where.status) && !where.updated_at) {
            Object.assign(r, data);
            count++;
          }
        return { count };
      },
      findMany: async ({ where }) => state.recipients.filter((r) => r.status === (where.status?.in ? r.status : where.status) && (!where.status?.in || where.status.in.includes(r.status))),
      update: async ({ where, data }) => Object.assign(state.recipients.find((r) => r.id === where.id), data),
      groupBy: async () => {
        const g = {};
        for (const r of state.recipients) g[r.status] = (g[r.status] || 0) + 1;
        return Object.entries(g).map(([status, n]) => ({ status, _count: { _all: n } }));
      },
      createMany: async ({ data }) => {
        state.created = data;
        return { count: data.length };
      },
    },
    whatsapp_contacts: {
      findFirst: async ({ where }) => state.contacts.find((c) => c.id === where.id && where.workspace_id === ws) || null,
      findMany: async ({ where }) => state.contacts.filter((c) => where.id.in.includes(c.id)),
    },
    whatsapp_conversations: { updateMany: async () => ({ count: 0 }) },
    whatsapp_templates: { findFirst: async () => state.template },
    $transaction: async (fn) => fn(prisma),
  };
  const svc = load("lib/whatsapp/contacts-service.ts", {
    "@prisma/client": { Prisma: {} },
    "@/lib/prisma": { prisma },
    "./repository": { accountFor: async () => ({ id: ids(800) }) },
    "./meta": meta,
    "./service": {
      sendMessage: async (_ws, input) => {
        sent.push(input);
        if (input.to === "34600000002") throw new meta.MetaError(131026);
        if (input.to === "34600000003") throw new rules.WhatsAppError("Envío sin confirmar", 502);
        return { status: "sent" };
      },
    },
    "./rules": rules,
    "./contacts": contacts,
  });
  return { svc, sent };
}

test("bulk send claims each recipient once, separates Meta rejections from unconfirmed sends", async () => {
  const contact = (n, extra = {}) => ({ id: ids(n), name: `C${n}`, phone: `3460000000${n}`, stage: "Sin contactar", do_not_contact: false, ...extra });
  const state = {
    campaign: { id: ids(900), account_id: ids(800), template_id: ids(700) },
    contacts: [contact(1), contact(2), contact(3), contact(4, { do_not_contact: true })],
    recipients: [1, 2, 3, 4].map((n) => ({ id: ids(100 + n), contact_id: ids(n), phone: `3460000000${n}`, parameters: [`C${n}`], status: "pending" })),
  };
  const { svc, sent } = campaignService(state);
  const progress = await svc.runCampaign(ws, { campaignId: ids(900) });
  assert.deepEqual(state.recipients.map((r) => r.status), ["sent", "failed", "unknown", "skipped"]);
  assert.match(state.recipients[1].error, /131026/);
  assert.equal(sent.length, 3, "an opt-out marked after planning is not sent");
  assert.equal(sent[0].requestId, ids(101), "the recipient id is the idempotent request id");
  assert.equal(progress.done, true);
  const repeat = await svc.runCampaign(ws, { campaignId: ids(900) });
  assert.equal(sent.length, 3, "a second run sends nothing more");
  assert.equal(repeat.counts.sent, 1);
  await assert.rejects(() => svc.runCampaign("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", { campaignId: ids(900) }), /no encontrado/);
});

test("bulk send requires explicit confirmation for contacts without recorded consent", async () => {
  const state = {
    template: { id: ids(700), name: "hola", components: [{ type: "BODY", text: "Hola {{1}}" }] },
    contacts: [
      { id: ids(1), name: "A", phone: "34600000001", stage: "Sin contactar", do_not_contact: false, consent: false, classification: null, last_contacted_at: null },
      { id: ids(2), name: "B", phone: "34600000002", stage: "Sin contactar", do_not_contact: false, consent: true, classification: null, last_contacted_at: null },
    ],
    recipients: [],
  };
  const { svc } = campaignService(state);
  const input = { accountId: ids(800), templateId: ids(700), variables: ["field:name"], contactIds: [ids(1), ids(2)] };
  const preview = await svc.previewCampaign(ws, input);
  assert.equal(preview.ready, 2);
  assert.equal(preview.withoutConsent, 1);
  assert.equal(preview.sample.text, "Hola A");
  await assert.rejects(() => svc.createCampaign(ws, "user", input), (e) => e.status === 409);
  await svc.createCampaign(ws, "user", { ...input, acknowledgeNoConsent: true });
  assert.deepEqual(state.created.map((r) => r.status), ["pending", "pending"]);
  await assert.rejects(() => svc.previewCampaign(ws, { ...input, variables: ["field:token_enc"] }), /variable/);
  await assert.rejects(() => svc.previewCampaign(ws, { ...input, variables: [] }), /variable/);
});

test("an inbound reply moves the prospect forward and BAJA marks it as do-not-contact", async () => {
  const id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const updates = [];
  const tx = {
    whatsapp_conversations: { upsert: async () => ({ id }), update: async () => {}, updateMany: async () => {} },
    whatsapp_messages: { createMany: async () => ({ count: 1 }) },
  };
  const wh = load("lib/whatsapp/webhook.ts", {
    "@/lib/prisma": {
      prisma: {
        whatsapp_accounts: { findFirst: async () => ({ id, workspace_id: ws }) },
        whatsapp_contacts: { updateMany: async (q) => updates.push(q) },
        $transaction: async (fn) => fn(tx),
      },
    },
    "./rules": rules,
    "./contacts": contacts,
  });
  const body = (text) => ({
    object: "whatsapp_business_account",
    entry: [{ id: "waba", changes: [{ value: { metadata: { phone_number_id: "1" }, messages: [{ id: "wamid." + text, from: "34600000001", timestamp: "1800000000", type: "text", text: { body: text } }] } }] }],
  });
  await wh.processWebhook(body("Hola, me interesa"));
  assert.equal(updates.length, 2);
  assert.deepEqual(updates[0].data, { stage: "Respondió" });
  assert.equal(updates[0].where.workspace_id, ws);
  assert.equal(updates[0].where.phone, "34600000001");
  updates.length = 0;
  await wh.processWebhook(body("BAJA"));
  assert.equal(updates.length, 3);
  assert.equal(updates[2].data.do_not_contact, true);
});
