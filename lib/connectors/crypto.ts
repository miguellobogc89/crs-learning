import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM for connector secrets (OAuth tokens, the OAuth state cookie). The key is CONNECTORS_ENCRYPTION_KEY:
 * 32 random bytes in base64 (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))").
 * Output: "v1.<iv>.<tag>.<ciphertext>" in base64url. Tampering or a different key makes decrypt() throw.
 */
export function connectorKey(raw = process.env.CONNECTORS_ENCRYPTION_KEY): Buffer {
  if (!raw) throw new Error("Falta CONNECTORS_ENCRYPTION_KEY en el entorno");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("CONNECTORS_ENCRYPTION_KEY debe ser de 32 bytes en base64");
  return key;
}

export function encrypt(plain: string, key: Buffer = connectorKey()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), data].map(p => typeof p === "string" ? p : p.toString("base64url")).join(".");
}

export function decrypt(sealed: string, key: Buffer = connectorKey()): string {
  const [version, iv, tag, data] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || data === undefined) throw new Error("Secreto con formato no válido");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
