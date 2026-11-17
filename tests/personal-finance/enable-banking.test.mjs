import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { generateKeyPairSync, randomBytes, verify } from "node:crypto";
import ts from "typescript";

const req = createRequire(import.meta.url);
function load(file, deps = {}) {
  const module = { exports: {} };
  const js = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "module", "exports", js)((name) => {
    if (name in deps) return deps[name];
    if (name.startsWith("node:")) return req(name);
    throw new Error(`Dependencia inesperada: ${name}`);
  }, module, module.exports);
  return module.exports;
}

const banking = load("lib/personal-finance/enable-banking.ts");
const crypto = load("lib/connectors/crypto.ts");
const consent = load("lib/personal-finance/consent.ts", {
  "@/lib/connectors/crypto": crypto,
  "@/lib/personal-finance/enable-banking": banking,
});

test("solo se aceptan los tres bancos de la primera versión", () => {
  assert.equal(banking.isPersonalBank("santander"), true);
  assert.equal(banking.isPersonalBank("bbva"), true);
  assert.equal(banking.isPersonalBank("revolut"), true);
  assert.equal(banking.isPersonalBank("otros"), false);
  assert.equal(banking.isPersonalBank(null), false);
});

test("JWT firmado con RSA y scope limitado a Enable Banking", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const old = { id: process.env.ENABLE_BANKING_APPLICATION_ID, key: process.env.ENABLE_BANKING_PRIVATE_KEY, fetch: globalThis.fetch };
  try {
    process.env.ENABLE_BANKING_APPLICATION_ID = "00000000-0000-0000-0000-000000000000";
    process.env.ENABLE_BANKING_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" });
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "https://api.enablebanking.com/application");
      const jwt = options.headers.Authorization.slice("Bearer ".length);
      const [h, p, s] = jwt.split(".");
      const header = JSON.parse(Buffer.from(h, "base64url"));
      const payload = JSON.parse(Buffer.from(p, "base64url"));
      assert.equal(header.kid, process.env.ENABLE_BANKING_APPLICATION_ID);
      assert.equal(header.alg, "RS256");
      assert.equal(payload.aud, "api.enablebanking.com");
      assert.equal(payload.iss, "enablebanking.com");
      assert.equal(verify("RSA-SHA256", Buffer.from(`${h}.${p}`), publicKey, Buffer.from(s, "base64url")), true);
      return { ok: true, json: async () => ({ status: "ok" }) };
    };
    assert.deepEqual(await banking.bankingRequest("/application"), { status: "ok" });
    await assert.rejects(banking.bankingRequest("https://evil.example"), /Ruta bancaria no válida/);
  } finally {
    globalThis.fetch = old.fetch;
    if (old.id === undefined) delete process.env.ENABLE_BANKING_APPLICATION_ID; else process.env.ENABLE_BANKING_APPLICATION_ID = old.id;
    if (old.key === undefined) delete process.env.ENABLE_BANKING_PRIVATE_KEY; else process.env.ENABLE_BANKING_PRIVATE_KEY = old.key;
  }
});

test("consentimiento en cookie cifrada verifica usuario, nonce y plazo", () => {
  const key = process.env.CONNECTORS_ENCRYPTION_KEY;
  try {
    process.env.CONNECTORS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    const state = consent.issueConsentState("user-A", "bbva");
    assert.equal(consent.verifyConsentState(state.cookie, state.nonce, "user-A")?.bank, "bbva");
    assert.equal(consent.verifyConsentState(state.cookie, state.nonce, "user-B"), null);
    assert.equal(consent.verifyConsentState(state.cookie, "nonce-incorrecto", "user-A"), null);
    const parts = state.cookie.split(".");
    parts[2] = randomBytes(16).toString("base64url");
    assert.equal(consent.verifyConsentState(parts.join("."), state.nonce, "user-A"), null);
  } finally {
    if (key === undefined) delete process.env.CONNECTORS_ENCRYPTION_KEY; else process.env.CONNECTORS_ENCRYPTION_KEY = key;
  }
});

test("el callback debe estar en la ruta esperada y con HTTPS", () => {
  const previous = process.env.ENABLE_BANKING_REDIRECT_URL;
  try {
    process.env.ENABLE_BANKING_REDIRECT_URL = "https://crs-learning.vercel.app/api/finance/banks/callback";
    assert.match(consent.bankingRedirectUrl(), /\/api\/finance\/banks\/callback$/);
    process.env.ENABLE_BANKING_REDIRECT_URL = "https://example.com/";
    assert.throws(consent.bankingRedirectUrl, /no es válida/);
  } finally {
    if (previous === undefined) delete process.env.ENABLE_BANKING_REDIRECT_URL; else process.env.ENABLE_BANKING_REDIRECT_URL = previous;
  }
});
