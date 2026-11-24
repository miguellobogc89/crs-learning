import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

/**
 * Tickets YAXI (JWT HS256). No sustituye todavía la integración de Enable Banking.
 * El secreto permanece exclusivamente en el servidor.
 */
export type YaxiService = "Accounts" | "Balances" | "Transactions";

export function isYaxiConfigured(): boolean {
  return Boolean(process.env.YAXI_API_KEY_ID && process.env.YAXI_API_SECRET);
}

export function issueYaxiTicket(service: YaxiService, data: unknown = null) {
  const keyId = process.env.YAXI_API_KEY_ID?.trim();
  const secret = process.env.YAXI_API_SECRET?.trim();
  if (!keyId || !secret) {
    throw new Error("Faltan las credenciales de YAXI en el servidor");
  }

  // YAXI entrega el secreto codificado en base64 y exige UUID v4 por ticket.
  const secretKey = Buffer.from(secret, "base64");
  if (secretKey.length < 16) {
    throw new Error("El secreto de YAXI no tiene un formato válido");
  }

  const ticketId = randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ typ: "JWT", alg: "HS256", kid: keyId }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      data: { service, id: ticketId, data },
      iat: now,
      exp: now + 600,
    }),
  ).toString("base64url");
  const unsigned = `${header}.${payload}`;
  const signature = createHmac("sha256", secretKey)
    .update(unsigned)
    .digest("base64url");

  return { ticketId, ticket: `${unsigned}.${signature}` };
}

/** Verify signed results server-side before accepting bank data from a browser. */
export function verifyYaxiResult(resultJwt: string, expectedTicketId: string): unknown {
  if (typeof resultJwt !== "string" || resultJwt.length > 500_000) {
    throw new Error("Resultado YAXI no válido");
  }
  const parts = resultJwt.split(".");
  if (parts.length !== 3 || parts.some((x) => !/^[A-Za-z0-9_-]+$/.test(x))) {
    throw new Error("Resultado YAXI no válido");
  }
  const [h, p, signature] = parts;
  let header: { alg?: unknown; kid?: unknown };
  let body: { exp?: unknown; data?: { ticketId?: unknown; timestamp?: unknown; data?: unknown } };
  try {
    header = JSON.parse(Buffer.from(h, "base64url").toString("utf8"));
    body = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
  } catch {
    throw new Error("Resultado YAXI no válido");
  }
  if (header.alg !== "HS256" || header.kid !== process.env.YAXI_API_KEY_ID?.trim()) {
    throw new Error("Firma YAXI no válida");
  }
  const secret = process.env.YAXI_API_SECRET?.trim();
  if (!secret) throw new Error("YAXI no está configurado");
  const key = Buffer.from(secret, "base64");
  const expected = createHmac("sha256", key).update(`${h}.${p}`).digest();
  const received = Buffer.from(signature, "base64url");
  if (received.length !== expected.length || !timingSafeEqual(expected, received)) {
    throw new Error("Firma YAXI no válida");
  }
  const now = Date.now();
  if (typeof body.exp !== "number" || body.exp * 1000 < now ||
      typeof body.data?.ticketId !== "string" || body.data.ticketId !== expectedTicketId) {
    throw new Error("Ticket YAXI inválido o caducado");
  }
  const stamp = Date.parse(String(body.data.timestamp ?? ""));
  if (!Number.isFinite(stamp) || stamp > now + 60_000 || stamp < now - 15 * 60_000) {
    throw new Error("Resultado YAXI fuera de plazo");
  }
  return body.data.data;
}
