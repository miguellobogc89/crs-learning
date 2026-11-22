// lib/push/webpush.ts
// Web Push sin librerías (22/11/2026), solo con node:crypto: cifrado del mensaje (RFC 8291, «aes128gcm») y firma
// del servidor (VAPID, RFC 8292). Es lo que hace la librería web-push, en pequeño. Sirve para Apple (iPhone con la
// app en la pantalla de inicio), Google (Android, Chrome) y Mozilla. Puro salvo los números aleatorios: lo prueban
// los tests con los vectores del RFC.
import { createCipheriv, createECDH, createHmac, createPrivateKey, generateKeyPairSync, randomBytes, sign, type KeyObject } from "node:crypto";

export const b64url = (b: Buffer | Uint8Array) => Buffer.from(b).toString("base64url");
export const unb64url = (s: string) => Buffer.from(s.replace(/=+$/, ""), "base64url");

/** Suscripción del navegador (PushSubscription.toJSON()). */
export type PushSub = { endpoint: string; keys: { p256dh: string; auth: string } };
/** Claves VAPID: pública sin comprimir (65 bytes) y privada (32 bytes), en base64url. */
export type VapidKeys = { publicKey: string; privateKey: string };

export function generateVapidKeys(): VapidKeys {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = publicKey.export({ format: "jwk" });
  const pub = Buffer.concat([Buffer.from([4]), unb64url(jwk.x!), unb64url(jwk.y!)]);
  const d = privateKey.export({ format: "jwk" }).d!;
  return { publicKey: b64url(pub), privateKey: d };
}

function privateKeyObject(keys: VapidKeys): KeyObject {
  const pub = unb64url(keys.publicKey);
  return createPrivateKey({
    format: "jwk",
    key: { kty: "EC", crv: "P-256", d: keys.privateKey, x: b64url(pub.subarray(1, 33)), y: b64url(pub.subarray(33, 65)) },
  });
}

/** Cabecera Authorization de VAPID para el servicio de push del endpoint (válida 12 h). */
export function vapidAuthorization(endpoint: string, keys: VapidKeys, subject: string, now = Date.now()) {
  const aud = new URL(endpoint).origin;
  const header = b64url(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64url(Buffer.from(JSON.stringify({ aud, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })));
  const data = `${header}.${claims}`;
  const sig = sign("sha256", Buffer.from(data), { key: privateKeyObject(keys), dsaEncoding: "ieee-p1363" });
  return `vapid t=${data}.${b64url(sig)}, k=${keys.publicKey}`;
}

const hmac = (key: Buffer, data: Buffer) => createHmac("sha256", key).update(data).digest();

/**
 * Cifra el mensaje para una suscripción (RFC 8291). `salt` y `serverPrivate` solo se pasan en los tests (vectores
 * del RFC); en uso normal son aleatorios en cada envío.
 */
export function encryptPayload(sub: PushSub, payload: string | Buffer, opts: { salt?: Buffer; serverPrivate?: Buffer } = {}) {
  const uaPublic = unb64url(sub.keys.p256dh);
  const authSecret = unb64url(sub.keys.auth);
  if (uaPublic.length !== 65 || authSecret.length !== 16) throw new Error("Suscripción de push no válida");
  const ecdh = createECDH("prime256v1");
  if (opts.serverPrivate) ecdh.setPrivateKey(opts.serverPrivate);
  else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);
  const salt = opts.salt ?? randomBytes(16);

  // Clave común (con el secreto de la suscripción) y, de ella, la clave y el nonce del contenido.
  const prkKey = hmac(authSecret, shared);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic, Buffer.from([1])]);
  const ikm = hmac(prkKey, keyInfo);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01")).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01")).subarray(0, 12);

  // Un solo bloque: el mensaje y el delimitador 0x02 (último bloque), sin relleno.
  const plain = Buffer.concat([Buffer.isBuffer(payload) ? payload : Buffer.from(payload, "utf8"), Buffer.from([2])]);
  const rs = 4096;
  if (plain.length + 16 > rs) throw new Error("Mensaje de push demasiado largo");
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const body = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
  const head = Buffer.alloc(21);
  salt.copy(head, 0);
  head.writeUInt32BE(rs, 16);
  head.writeUInt8(asPublic.length, 20);
  return Buffer.concat([head, asPublic, body]);
}

export type PushMessage = { title: string; body?: string | null; url?: string | null; tag?: string | null };

/**
 * Envía un aviso. Devuelve el código HTTP del servicio de push: 201/200 = entregado; 404/410 = la suscripción ya
 * no existe (hay que borrarla); otro = fallo puntual.
 */
export async function sendPush(sub: PushSub, msg: PushMessage, keys: VapidKeys, subject: string, opts: { ttl?: number; urgency?: "normal" | "high" } = {}) {
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: vapidAuthorization(sub.endpoint, keys, subject),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(opts.ttl ?? 24 * 3600),
      Urgency: opts.urgency ?? "high",
    },
    body: new Uint8Array(encryptPayload(sub, JSON.stringify(msg))),
    signal: AbortSignal.timeout(10_000),
  });
  return { status: res.status, text: res.ok ? "" : (await res.text().catch(() => "")).slice(0, 200) };
}
