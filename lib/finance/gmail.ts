// lib/finance/gmail.ts
// Gmail de CRS Finance (por persona, solo lectura): conexión OAuth con el mismo cliente de Google que Drive,
// lectura de los correos de suscripciones y facturas, y avisos de suscripciones zombi.
import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/connectors/crypto";
import { challenge, exchangeCode, fetchAccount, oauthConfig, refreshAccessToken, revoke, TokenError, type OAuthConfig } from "@/lib/connectors/google-drive/oauth";
import { classifyEmail, findZombies, GMAIL_QUERY, merchantOf, type EmailEvent, type EmailKind } from "./email-logic";
import { loadTxs } from "./store";

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const GMAIL_CALLBACK = "/api/finance/gmail/callback";
export const GMAIL_STATE_COOKIE = "crs_gmail_oauth";
const API = "https://gmail.googleapis.com/gmail/v1/users/me";

/** Mismo cliente de Google que Drive, con su propia dirección de vuelta. */
export function gmailConfig(origin: string): OAuthConfig {
  const base = oauthConfig(origin);
  return { ...base, redirectUri: new URL(GMAIL_CALLBACK, origin).toString() };
}

export type GmailState = { state: string; verifier: string; userId: string; expiresAt: number };

export function gmailStart(origin: string, userId: string) {
  const st: GmailState = { state: randomBytes(24).toString("base64url"), verifier: randomBytes(48).toString("base64url"), userId, expiresAt: Date.now() + 10 * 60_000 };
  const c = gmailConfig(origin);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: c.clientId, redirect_uri: c.redirectUri, response_type: "code", scope: ["openid", "email", GMAIL_SCOPE].join(" "),
    access_type: "offline", prompt: "consent", include_granted_scopes: "true",
    state: st.state, code_challenge: challenge(st.verifier), code_challenge_method: "S256",
  }).toString();
  return { url: url.toString(), cookie: encrypt(JSON.stringify(st)) };
}

export async function gmailFinish(origin: string, params: URLSearchParams, cookie: string | undefined, userId: string) {
  if (params.get("error")) throw new Error(params.get("error") === "access_denied" ? "Has cancelado el permiso en Google" : `Google devolvió un error: ${params.get("error")}`);
  let st: GmailState | null = null;
  try { st = cookie ? (JSON.parse(decrypt(cookie)) as GmailState) : null; } catch { st = null; }
  if (!st || st.expiresAt < Date.now() || st.state !== params.get("state") || st.userId !== userId || !params.get("code")) throw new Error("La conexión ha caducado; vuelve a pulsar «Conectar Gmail»");
  const tokens = await exchangeCode(gmailConfig(origin), params.get("code")!, st.verifier);
  if (!tokens.scopes.includes(GMAIL_SCOPE)) throw new Error("No se concedió el permiso para leer el correo. Vuelve a conectar y marca esa casilla.");
  if (!tokens.refreshToken) throw new Error("Google no devolvió un acceso permanente; vuelve a conectar");
  const account = await fetchAccount(tokens.accessToken);
  await prisma.$executeRaw`INSERT INTO finance_gmail (user_id, email, status, refresh_token_enc, access_token_enc, access_token_expires_at, last_error, updated_at)
    VALUES (${userId}::uuid, ${account.email}, 'active', ${encrypt(tokens.refreshToken)}, ${encrypt(tokens.accessToken)}, ${tokens.expiresAt}, NULL, now())
    ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email, status = 'active', refresh_token_enc = EXCLUDED.refresh_token_enc,
      access_token_enc = EXCLUDED.access_token_enc, access_token_expires_at = EXCLUDED.access_token_expires_at, last_error = NULL, updated_at = now()`;
}

type Row = { user_id: string; email: string | null; status: string; refresh_token_enc: string | null; access_token_enc: string | null; access_token_expires_at: Date | null; last_error: string | null; last_sync_at: Date | null };
const row = async (userId: string) => (await prisma.$queryRaw<Row[]>`SELECT * FROM finance_gmail WHERE user_id = ${userId}::uuid`)[0] ?? null;

async function token(userId: string, origin: string) {
  const r = await row(userId);
  if (!r?.refresh_token_enc || r.status !== "active") throw new Error("Gmail no está conectado");
  if (r.access_token_enc && r.access_token_expires_at && r.access_token_expires_at.getTime() - 60_000 > Date.now()) return decrypt(r.access_token_enc);
  try {
    const t = await refreshAccessToken(gmailConfig(origin), decrypt(r.refresh_token_enc));
    await prisma.$executeRaw`UPDATE finance_gmail SET access_token_enc = ${encrypt(t.accessToken)}, access_token_expires_at = ${t.expiresAt}, updated_at = now() WHERE user_id = ${userId}::uuid`;
    return t.accessToken;
  } catch (e) {
    if (e instanceof TokenError && e.needsReconnect) {
      // En modo pruebas de Google, el permiso caduca cada 7 días: hay que volver a conectar.
      await prisma.$executeRaw`UPDATE finance_gmail SET status = 'error', last_error = 'Google ha caducado o retirado el permiso. Vuelve a conectar Gmail.', access_token_enc = NULL, updated_at = now() WHERE user_id = ${userId}::uuid`;
      throw new Error("Google ha caducado o retirado el permiso. Vuelve a conectar Gmail.");
    }
    throw e;
  }
}

async function gmail<T>(tok: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${tok}` }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Gmail respondió ${res.status}`);
  return res.json() as Promise<T>;
}

/** Lee los correos nuevos de suscripciones y facturas (solo remitente, asunto, fecha y el resumen de Gmail). */
export async function syncGmail(userId: string, origin: string, maxMessages = 300) {
  const tok = await token(userId, origin);
  const known = new Set((await prisma.$queryRaw<{ message_id: string }[]>`SELECT message_id FROM finance_email_events WHERE user_id = ${userId}::uuid`).map((r) => r.message_id));
  const ids: string[] = [];
  let page: string | undefined;
  do {
    const q = new URLSearchParams({ q: GMAIL_QUERY, maxResults: "100", ...(page ? { pageToken: page } : {}) });
    const list = await gmail<{ messages?: { id: string }[]; nextPageToken?: string }>(tok, `/messages?${q}`);
    for (const m of list.messages ?? []) if (!known.has(m.id)) ids.push(m.id);
    page = list.nextPageToken;
  } while (page && ids.length < maxMessages);
  let added = 0;
  for (let i = 0; i < Math.min(ids.length, maxMessages); i += 10) {
    const batch = await Promise.all(ids.slice(i, i + 10).map((id) =>
      gmail<{ id: string; snippet?: string; internalDate?: string; payload?: { headers?: { name: string; value: string }[] } }>(tok, `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`).catch(() => null)));
    for (const m of batch) {
      if (!m) continue;
      const h = (n: string) => m.payload?.headers?.find((x) => x.name.toLowerCase() === n)?.value ?? "";
      const subject = h("subject").slice(0, 300);
      const kind = classifyEmail(subject, m.snippet ?? "");
      // Lo que no es de suscripciones ni facturas no se guarda.
      if (!kind) continue;
      const from = h("from").slice(0, 200);
      const { merchant, domain } = merchantOf(from);
      const date = new Date(Number(m.internalDate ?? Date.now())).toISOString().slice(0, 10);
      added += await prisma.$executeRaw`INSERT INTO finance_email_events (user_id, message_id, date, sender, domain, merchant, subject, snippet, kind)
        VALUES (${userId}::uuid, ${m.id}, ${date}::date, ${from}, ${domain}, ${merchant}, ${subject}, ${(m.snippet ?? "").slice(0, 300)}, ${kind}) ON CONFLICT DO NOTHING`;
    }
  }
  await prisma.$executeRaw`UPDATE finance_gmail SET last_sync_at = now(), last_error = NULL, updated_at = now() WHERE user_id = ${userId}::uuid`;
  return { added, scanned: Math.min(ids.length, maxMessages) };
}

export async function disconnectGmail(userId: string) {
  const r = await row(userId);
  if (r?.refresh_token_enc) await revoke(decrypt(r.refresh_token_enc)).catch(() => undefined);
  await prisma.$executeRaw`DELETE FROM finance_gmail WHERE user_id = ${userId}::uuid`;
}

type EventRow = { message_id: string; date: Date; merchant: string | null; subject: string | null; kind: string; sender: string | null };
const events = async (userId: string) => (await prisma.$queryRaw<EventRow[]>`SELECT message_id, date, merchant, subject, kind, sender FROM finance_email_events WHERE user_id = ${userId}::uuid ORDER BY date DESC`)
  .map((e): EmailEvent & { sender: string | null } => ({ messageId: e.message_id, date: e.date.toISOString().slice(0, 10), merchant: e.merchant, subject: e.subject ?? "", kind: e.kind as EmailKind, sender: e.sender }));

/** Suscripciones zombi de una persona (cargos después de un correo de cancelación). */
export async function zombies(userId: string) {
  const [ev, txs] = await Promise.all([events(userId), loadTxs(userId, { includeExcluded: true })]);
  return findZombies(ev, txs.map((t) => ({ id: t.id, date: t.date, amount: t.amount, description: t.description, counterparty: t.counterparty })));
}

/** Para la pantalla de Conexiones: estado, último correo leído y lo detectado. */
export async function gmailView(userId: string) {
  const r = await row(userId).catch(() => null);
  if (!r) return { status: "disconnected" as const, email: null, lastSyncAt: null, lastError: null, counts: {}, recent: [], zombies: [] };
  const ev = await events(userId);
  const counts = ev.reduce<Record<string, number>>((acc, e) => ({ ...acc, [e.kind]: (acc[e.kind] ?? 0) + 1 }), {});
  return {
    status: (r.status === "active" ? "active" : "error") as "active" | "error",
    email: r.email,
    lastSyncAt: r.last_sync_at?.toISOString() ?? null,
    lastError: r.last_error,
    counts,
    recent: ev.filter((e) => e.kind === "cancelacion" || e.kind === "subida").slice(0, 8),
    zombies: (await zombies(userId)).map((z) => ({ merchant: z.merchant, cancelledOn: z.cancelledOn, subject: z.subject, charges: z.charges.map((c) => ({ date: c.date, amount: c.amount, description: c.description })) })),
  };
}

/** Todos los que tienen Gmail conectado (para el cron diario). */
export async function gmailUsers() {
  return (await prisma.$queryRaw<{ user_id: string }[]>`SELECT user_id FROM finance_gmail WHERE status = 'active'`).map((r) => r.user_id);
}
