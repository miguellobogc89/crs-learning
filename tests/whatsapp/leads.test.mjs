import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
function load(path, deps = {}) {
  const m = { exports: {} };
  const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "module", "exports", code)((n) => { if (n in deps) return deps[n]; throw Error(`Missing test dependency: ${n}`); }, m, m.exports);
  return m.exports;
}
const contacts = load("lib/whatsapp/contacts.ts");
const L = load("lib/whatsapp/leads.ts", { "./contacts": contacts });

const c = (id, extra = {}) => ({ id, name: `Empresa ${id}`, phone: `3460000000${id}`, category: null, specialty: "DJ", city: "Barcelona", rating: 4.5,
  classification: "Revisar", stage: "Sin contactar", do_not_contact: false, consent: false, last_contacted_at: null, last_reply_at: null, ...extra });
const conv = (phone, extra = {}) => ({ id: `conv-${phone}`, contact_phone: phone, contact_name: null, unread_count: 0,
  last_message_at: "2026-11-01T10:00:00Z", last_inbound_at: null, ...extra });

const people = [
  c("1"),                                                                    // never contacted
  c("2", { stage: "Contactado", last_contacted_at: "2026-10-28T10:00:00Z" }), // contacted, no answer
  c("3", { stage: "Respondió", rating: 5, last_contacted_at: "2026-10-28T10:00:00Z", last_reply_at: "2026-11-01T10:00:00Z" }),
  c("4", { stage: "Interesado", rating: 4.9, last_contacted_at: "2026-10-20T10:00:00Z", last_reply_at: "2026-10-30T10:00:00Z" }),
  c("5", { do_not_contact: true, last_contacted_at: "2026-10-20T10:00:00Z" }),
  c("6", { phone: null, rating: 5 }),                                          // no WhatsApp
  c("7", { stage: "Cliente", rating: 3 }),
];
const conversations = [
  conv("34600000002", { last_message_at: "2026-10-28T10:00:00Z" }),
  conv("34600000003", { unread_count: 1, last_message_at: "2026-11-01T10:00:00Z", last_inbound_at: "2026-11-01T10:00:00Z" }),
  conv("34600000004", { last_message_at: "2026-10-31T09:00:00Z", last_inbound_at: "2026-10-30T10:00:00Z" }),  // we answered after
  conv("34600000005", { last_message_at: "2026-11-01T12:00:00Z", last_inbound_at: "2026-11-01T12:00:00Z" }),  // BAJA
  conv("34699999999", { contact_name: "Desconocido", unread_count: 2, last_message_at: "2026-10-31T08:00:00Z", last_inbound_at: "2026-10-31T08:00:00Z" }),
];
const leads = L.buildLeads(people, conversations);
const keys = (g, q) => L.leadsOf(leads, g, q).map((l) => l.contact?.id ?? l.conversation.contact_name);

test("contacts and conversations are joined by phone; strangers become leads of their own", () => {
  assert.equal(leads.length, 8);
  assert.equal(leads.find((l) => l.contact?.id === "3").conversation.id, "conv-34600000003");
  assert.equal(leads.find((l) => l.contact?.id === "1").conversation, null);
  assert.deepEqual(keys("nuevos"), ["Desconocido"]);
});

test("fixed groups: waiting for an answer, unread, funnel and rating; opt-outs only under Descartados", () => {
  assert.deepEqual(keys("por_contestar"), ["Desconocido", "3"], "longest waiting first; the opted-out one is left out");
  assert.deepEqual(keys("sin_leer").sort(), ["3", "Desconocido"]);
  assert.deepEqual(keys("sin_contactar"), ["1"], "a contact without WhatsApp cannot be contacted");
  assert.deepEqual(keys("sin_respuesta"), ["2"]);
  assert.deepEqual(keys("respondieron").sort(), ["3", "4"]);
  assert.deepEqual(keys("interesados"), ["4"]);
  assert.deepEqual(keys("clientes"), ["7"]);
  assert.deepEqual(keys("descartados"), ["5"]);
  assert.deepEqual(keys("estrellas_5").sort(), ["3", "6"]);
  assert.ok(!keys("estrellas_4").includes("5"));
  assert.equal(keys("todos").length, 8);
  const counts = L.groupCounts(leads);
  assert.equal(counts.por_contestar, 2);
  assert.equal(counts.nuevos, 1);
  assert.equal(L.awaitingReply(conversations[2]), false, "we answered after their last message");
});

test("search by name, city, specialty or phone; latest activity first elsewhere", () => {
  assert.equal(keys("todos", "dj barcelona").length, 7, "every word must match: the stranger has no city");
  assert.deepEqual(keys("interesados", "empresa"), ["4"]);
  assert.deepEqual(keys("todos", "699999"), ["Desconocido"]);
  assert.equal(keys("todos")[0], "5", "latest activity first");
  assert.equal(L.isGroup("por_contestar"), true);
  assert.equal(L.isGroup("x"), false);
});
