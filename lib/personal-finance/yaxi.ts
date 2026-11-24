import "server-only";

import { createHmac, randomUUID } from "node:crypto";

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
