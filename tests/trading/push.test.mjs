// Web Push sin librerías: cifrado (RFC 8291) y firma VAPID (RFC 8292).
import test from "node:test";
import assert from "node:assert/strict";
import { createDecipheriv, createECDH, createHmac, createPublicKey, verify } from "node:crypto";
import { load } from "./helpers.mjs";

const W = load("lib/push/webpush.ts");
const u = (s) => Buffer.from(s, "base64url");
const hmac = (k, d) => createHmac("sha256", k).update(d).digest();

// RFC 8291, apéndice A.
const V = {
  plaintext: "When I grow up, I want to be a watermelon",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  uaPrivate: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
  uaPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
};

/** Descifra como lo haría el móvil (lado del navegador del RFC). */
function decrypt(body, uaPrivate, auth) {
  const salt = body.subarray(0, 16);
  const idlen = body[20];
  const asPublic = body.subarray(21, 21 + idlen);
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(uaPrivate);
  const uaPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(asPublic);
  const ikm = hmac(hmac(auth, shared), Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01")).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01")).subarray(0, 12);
  const data = body.subarray(21 + idlen);
  const d = createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(data.subarray(data.length - 16));
  const plain = Buffer.concat([d.update(data.subarray(0, data.length - 16)), d.final()]);
  assert.equal(plain[plain.length - 1], 2, "delimitador de último bloque");
  return plain.subarray(0, plain.length - 1).toString("utf8");
}

test("push: cifrado con los datos del RFC 8291 (cabecera y descifrado)", () => {
  const sub = { endpoint: "https://push.example.net/x", keys: { p256dh: V.uaPublic, auth: V.auth } };
  const body = W.encryptPayload(sub, V.plaintext, { salt: u(V.salt), serverPrivate: u(V.asPrivate) });
  // Cabecera: sal, tamaño de bloque 4096 y la clave pública del servidor (65 bytes).
  assert.deepEqual(body.subarray(0, 16), u(V.salt));
  assert.equal(body.readUInt32BE(16), 4096);
  assert.equal(body[20], 65);
  // Mensaje + delimitador (1) + etiqueta (16).
  assert.equal(body.length, 21 + 65 + V.plaintext.length + 1 + 16);
  assert.equal(decrypt(body, u(V.uaPrivate), u(V.auth)), V.plaintext);
  // Byte a byte, el mensaje cifrado que da el RFC.
  assert.equal(
    W.b64url(body),
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
  );
});

test("push: cada envío usa clave y sal nuevas y el móvil lo descifra", () => {
  const ua = createECDH("prime256v1");
  ua.generateKeys();
  const auth = Buffer.from("0123456789abcdef");
  const sub = { endpoint: "https://web.push.apple.com/abc", keys: { p256dh: W.b64url(ua.getPublicKey()), auth: W.b64url(auth) } };
  const msg = JSON.stringify({ title: "Cierre · AVAX · +1,03 €", body: "ENJAMBRE x3 cierra el corto", url: "/trading/cartera" });
  const a = W.encryptPayload(sub, msg);
  const b = W.encryptPayload(sub, msg);
  assert.notDeepEqual(a.subarray(0, 16), b.subarray(0, 16));
  assert.equal(decrypt(a, ua.getPrivateKey(), auth), msg);
  assert.equal(decrypt(b, ua.getPrivateKey(), auth), msg);
  assert.throws(() => W.encryptPayload({ ...sub, keys: { p256dh: "AAAA", auth: sub.keys.auth } }, msg));
});

test("push: firma VAPID válida con la clave pública que se da al navegador", () => {
  const keys = W.generateVapidKeys();
  assert.equal(u(keys.publicKey).length, 65);
  assert.equal(u(keys.privateKey).length, 32);
  const now = Date.UTC(2026, 10, 22, 8);
  const h = W.vapidAuthorization("https://web.push.apple.com/QWERTY", keys, "https://crussader.com", now);
  const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(h);
  assert.ok(m);
  assert.equal(m[4], keys.publicKey);
  const claims = JSON.parse(u(m[2]).toString());
  assert.deepEqual(claims, { aud: "https://web.push.apple.com", exp: now / 1000 + 12 * 3600, sub: "https://crussader.com" });
  const pub = u(keys.publicKey);
  const key = createPublicKey({ format: "jwk", key: { kty: "EC", crv: "P-256", x: W.b64url(pub.subarray(1, 33)), y: W.b64url(pub.subarray(33)) } });
  assert.ok(verify("sha256", Buffer.from(`${m[1]}.${m[2]}`), { key, dsaEncoding: "ieee-p1363" }, u(m[3])));
});

test("push: cada aviso va a su interruptor y los del stop vienen apagados", () => {
  const K = load("lib/push/kinds.ts");
  assert.equal(K.pushKind({ key: "op:compra:1", level: "operacion" }), "trades");
  assert.equal(K.pushKind({ key: "op:venta:1", level: "operacion" }), "trades");
  assert.equal(K.pushKind({ key: "op:stop:1:5.2", level: "operacion" }), "stops");
  assert.equal(K.pushKind({ key: "faro-parado", level: "error" }), "health");
  assert.equal(K.pushKind({ key: "faro-parado", level: "ok" }), "health");
  assert.deepEqual(K.DEFAULT_PREFS, { trades: true, stops: false, health: true });
});
