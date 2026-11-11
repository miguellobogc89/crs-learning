// Firma de Binance: HMAC (clave del sistema) y Ed25519/RSA (clave autogenerada), aunque la privada llegue en una línea.
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, generateKeyPairSync, verify } from "node:crypto";
import { load } from "../trading/helpers.mjs";

const S = load("lib/brokers/adapters/binance/signing.ts");
const payload = "symbol=BTCEUR&side=BUY&type=MARKET&quantity=0.001&recvWindow=5000&timestamp=1";

test("binance: secreto HMAC → firma hexadecimal", () => {
  const secret = "a".repeat(32) + "B".repeat(32);
  assert.equal(S.signPayload(secret, payload), createHmac("sha256", secret).update(payload).digest("hex"));
});

test("binance: Ed25519 en PEM, en una línea o solo el contenido", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const pem = privateKey.export({ type: "pkcs8", format: "pem" });
  const oneLine = pem.replace(/\n/g, "");
  const body = pem.split("\n")[1];
  for (const secret of [pem, oneLine, ` ${oneLine} `, body]) {
    const sig = S.signPayload(secret, payload);
    assert.ok(verify(null, Buffer.from(payload), publicKey, Buffer.from(sig, "base64")), "firma válida");
  }
});

test("binance: RSA firma con SHA-256 y una PEM rota da error claro", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const sig = S.signPayload(privateKey.export({ type: "pkcs8", format: "pem" }), payload);
  assert.ok(verify("sha256", Buffer.from(payload), publicKey, Buffer.from(sig, "base64")));
  assert.throws(() => S.signPayload("-----BEGIN PRIVATE KEY-----nope-----END PRIVATE KEY-----", payload), /no es válida/);
});

test("binance: el contenido Ed25519 sin cabeceras (64 caracteres) no se confunde con un secreto HMAC", () => {
  for (let i = 0; i < 300; i++) {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const body = privateKey.export({ type: "pkcs8", format: "pem" }).split("\n")[1];
    const sig = S.signPayload(body, payload);
    assert.ok(verify(null, Buffer.from(payload), publicKey, Buffer.from(sig, "base64")));
  }
});
