import { createHash, createHmac } from "node:crypto";

/**
 * Kraken Futures v3: Authent = base64(HMAC-SHA512(base64decode(secret),
 *   SHA256(urlEncodedPostData + nonce + '/api/v3/<endpoint>'))).
 * The path must NOT include /derivatives; hash the already URL-encoded payload.
 */
export function signKrakenRequest(postData: string, endpointPath: string, secret: string, nonce = ""): string {
  if (!/^\/api\/v3\/[a-z0-9/-]+$/i.test(endpointPath)) throw new Error("Ruta de firma de Kraken Futures no válida.");
  if (!secret || !/^[A-Za-z0-9+/]+={0,2}$/.test(secret) || secret.length % 4 !== 0) {
    throw new Error("El secreto API de Kraken Futures debe estar en base64.");
  }
  const key = Buffer.from(secret, "base64");
  if (!key.length) throw new Error("Secreto API de Kraken Futures vacío.");
  const hash = createHash("sha256").update(postData + nonce + endpointPath).digest();
  return createHmac("sha512", key).update(hash).digest("base64");
}
