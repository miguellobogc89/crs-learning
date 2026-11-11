// lib/brokers/adapters/binance/signing.ts
// Firma de las peticiones a Binance según el tipo de clave:
// - generada por el sistema (HMAC-SHA256): el «Secret Key» de 64 caracteres → firma en hexadecimal;
// - autogenerada (Ed25519 o RSA): el «secreto» es tu clave privada (PEM, aunque llegue pegada en una
//   sola línea, o solo su contenido en base64) → firma en base64.
// Puro (solo node:crypto): lo prueban los tests.
import { createHmac, createPrivateKey, sign, type KeyObject } from "node:crypto";

const keys = new Map<string, KeyObject | null>();

/** Clave privada asimétrica a partir de lo que pegó el usuario, o null si es un secreto HMAC. */
export function privateKeyOf(secret: string): KeyObject | null {
  if (keys.has(secret)) return keys.get(secret)!;
  let key: KeyObject | null = null;
  const s = secret.trim();
  const pem = /-----BEGIN ((?:RSA |EC |ENCRYPTED )?PRIVATE KEY)-----([\s\S]*?)-----END \1-----/.exec(s);
  if (pem || !/^[A-Za-z0-9]{64}$/.test(s)) {
    const body = (pem ? pem[2] : s).replace(/\s+/g, "");
    if (/^[A-Za-z0-9+/=]{40,}$/.test(body)) {
      try {
        key = createPrivateKey({ key: Buffer.from(body, "base64"), format: "der", type: pem?.[1] === "RSA PRIVATE KEY" ? "pkcs1" : "pkcs8" });
      } catch {
        if (pem) throw new Error("La clave privada no es válida: pega el archivo .pem completo");
      }
    } else if (pem) throw new Error("La clave privada no es válida: pega el archivo .pem completo");
  }
  if (key && key.asymmetricKeyType !== "ed25519" && key.asymmetricKeyType !== "rsa") throw new Error("Binance solo admite claves Ed25519 o RSA");
  keys.set(secret, key);
  return key;
}

/** Firma la cadena de la petición (query string) como la espera Binance. */
export function signPayload(secret: string, payload: string): string {
  const key = privateKeyOf(secret);
  if (!key) return createHmac("sha256", secret).update(payload).digest("hex");
  const data = Buffer.from(payload);
  return (key.asymmetricKeyType === "ed25519" ? sign(null, data, key) : sign("sha256", data, key)).toString("base64");
}
