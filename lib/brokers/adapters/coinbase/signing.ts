// lib/brokers/adapters/coinbase/signing.ts
// Autenticación de Coinbase Advanced Trade: un JWT nuevo por petición (caduca a los 2 minutos), firmado
// con la clave privada de la API key de la plataforma de desarrolladores de Coinbase (CDP):
// - ECDSA (la que recomienda Coinbase): PEM «EC PRIVATE KEY» → ES256;
// - Ed25519: 64 bytes en base64 (semilla + clave pública) → EdDSA.
// Acepta también el JSON que descarga Coinbase al crear la clave ({ name|id, privateKey }).
// Puro (solo node:crypto): lo prueban los tests.
import { createPrivateKey, randomBytes, sign, type KeyObject } from "node:crypto";

export const HOST = "api.coinbase.com";

/** Cabecera DER de una clave privada Ed25519 en PKCS#8 (le sigue la semilla de 32 bytes). */
const ED25519_PKCS8 = Buffer.from("302e020100300506032b657004220420", "hex");

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

/** Lo que pega el usuario: nombre de la clave y clave privada (o el JSON descargado en cualquiera de los dos campos). */
export function normalizeCredentials(apiKey: string, apiSecret: string): { name: string; secret: string } {
  let name = apiKey.trim();
  let secret = apiSecret.trim();
  for (const raw of [secret, name]) {
    if (!raw.startsWith("{")) continue;
    try {
      const j = JSON.parse(raw) as { name?: unknown; id?: unknown; privateKey?: unknown };
      if (typeof j.privateKey === "string") secret = j.privateKey;
      if (typeof j.name === "string") name = j.name;
      else if (typeof j.id === "string" && raw === name) name = j.id;
    } catch {
      // No era JSON: se queda tal cual.
    }
  }
  // Pegada en una sola línea desde un .env o un JSON: «\n» literales.
  return { name: name.trim(), secret: secret.replace(/\\n/g, "\n").trim() };
}

const keys = new Map<string, { key: KeyObject; alg: "ES256" | "EdDSA" }>();

export function signingKeyOf(secret: string): { key: KeyObject; alg: "ES256" | "EdDSA" } {
  const hit = keys.get(secret);
  if (hit) return hit;
  let out: { key: KeyObject; alg: "ES256" | "EdDSA" };
  const pem = /-----BEGIN ((?:EC )?PRIVATE KEY)-----([\s\S]*?)-----END \1-----/.exec(secret);
  if (pem) {
    // Aunque llegue sin saltos de línea: se reconstruye el PEM a partir de su contenido.
    const body = pem[2].replace(/\s+/g, "");
    const lines = body.match(/.{1,64}/g) ?? [];
    let key: KeyObject;
    try {
      key = createPrivateKey(`-----BEGIN ${pem[1]}-----\n${lines.join("\n")}\n-----END ${pem[1]}-----\n`);
    } catch {
      throw new Error("La clave privada de Coinbase no es válida: pega el bloque «-----BEGIN EC PRIVATE KEY-----» completo");
    }
    if (key.asymmetricKeyType === "ec") out = { key, alg: "ES256" };
    else if (key.asymmetricKeyType === "ed25519") out = { key, alg: "EdDSA" };
    else throw new Error("Coinbase solo admite claves ECDSA o Ed25519");
  } else {
    const raw = Buffer.from(secret.replace(/\s+/g, ""), "base64");
    if (raw.length !== 64 && raw.length !== 32) {
      throw new Error("La clave privada de Coinbase no es válida: pega el bloque «-----BEGIN EC PRIVATE KEY-----» completo (clave ECDSA)");
    }
    const key = createPrivateKey({ key: Buffer.concat([ED25519_PKCS8, raw.subarray(0, 32)]), format: "der", type: "pkcs8" });
    out = { key, alg: "EdDSA" };
  }
  keys.set(secret, out);
  return out;
}

/**
 * JWT para una petición REST. `path` sin la consulta (?…), como lo firman los SDK oficiales:
 * uri = «GET api.coinbase.com/api/v3/brokerage/accounts».
 */
export function buildJwt(name: string, secret: string, method: string, path: string, nowMs: number, nonce = randomBytes(16).toString("hex")): string {
  const { key, alg } = signingKeyOf(secret);
  const nbf = Math.floor(nowMs / 1000);
  const header = { alg, kid: name, nonce, typ: "JWT" };
  const payload = { iss: "cdp", sub: name, nbf, exp: nbf + 120, uri: `${method.toUpperCase()} ${HOST}${path}` };
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = alg === "ES256" ? sign("sha256", Buffer.from(input), { key, dsaEncoding: "ieee-p1363" }) : sign(null, Buffer.from(input), key);
  return `${input}.${b64url(sig)}`;
}
