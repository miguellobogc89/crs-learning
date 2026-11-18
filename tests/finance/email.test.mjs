// CRS Finance: correos de suscripciones (clasificación, comercio y suscripciones zombi).
import test from "node:test";
import assert from "node:assert/strict";
import { load } from "../trading/helpers.mjs";

const E = load("lib/finance/email-logic.ts");

test("tipo de correo por el asunto", () => {
  assert.equal(E.classifyEmail("Your ElevenLabs subscription has been cancelled"), "cancelacion");
  assert.equal(E.classifyEmail("Confirmación de la cancelación de tu suscripción"), "cancelacion");
  assert.equal(E.classifyEmail("Te has dado de baja de Disney+"), "cancelacion");
  assert.equal(E.classifyEmail("Cancela cuando quieras: prueba 30 días gratis"), null);
  assert.equal(E.classifyEmail("Actualización del precio de tu plan"), "subida");
  assert.equal(E.classifyEmail("Your plan renews on December 15"), "renovacion");
  assert.equal(E.classifyEmail("Tu factura de noviembre"), "factura");
  assert.equal(E.classifyEmail("Novedades de la semana"), null);
});

test("comercio del remitente", () => {
  assert.equal(E.merchantOf("ElevenLabs <billing@mail.elevenlabs.io>").merchant, "elevenlabs");
  assert.equal(E.merchantOf("Netflix <info@account.netflix.com>").merchant, "netflix");
  assert.equal(E.merchantOf("no-reply@spotify.com").merchant, "spotify");
});

test("suscripciones zombi: cargos tras el correo de cancelación", () => {
  const events = [
    { messageId: "a", date: "2026-10-03", merchant: "elevenlabs", subject: "Subscription cancelled", kind: "cancelacion" },
    { messageId: "b", date: "2026-09-01", merchant: "netflix", subject: "Tu factura", kind: "factura" },
  ];
  const txs = [
    { id: "1", date: "2026-10-04", amount: -5, description: "ELEVENLABS.IO", counterparty: null },
    { id: "2", date: "2026-11-03", amount: -22, description: "Compra Elevenlabs.io, New York", counterparty: null },
    { id: "3", date: "2026-11-05", amount: -12.99, description: "NETFLIX.COM", counterparty: null },
  ];
  const z = E.findZombies(events, txs);
  assert.equal(z.length, 1);
  assert.equal(z[0].merchant, "elevenlabs");
  assert.deepEqual(z[0].charges.map((c) => c.id), ["2"], "el cargo de 1 día después no cuenta (puede ser el último ya facturado)");
});
