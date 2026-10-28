// Sends a sample of an email template to one address, to see it in a real inbox.
//   node --env-file=.env scripts/email/send-test.mjs <bienvenida|verificar|recuperar|cambiada> <correo>
// Needs RESEND_API_KEY and EMAIL_FROM in .env. NEXT_PUBLIC_APP_URL decides the links and the logo (the logo must be
// on a public site, e.g. https://www.crussader.com, to show in the inbox).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { Resend } from "resend";

const [kind = "bienvenida", to] = process.argv.slice(2);
if (!to) { console.error("Uso: node --env-file=.env scripts/email/send-test.mjs <bienvenida|verificar|recuperar|cambiada> <correo>"); process.exit(1); }
for (const k of ["RESEND_API_KEY", "EMAIL_FROM"]) if (!process.env[k]) { console.error(`Falta ${k} en .env`); process.exit(1); }

const require = createRequire(import.meta.url);
const cache = {};
function load(name) {
  if (cache[name]) return cache[name];
  const m = { exports: {} };
  const js = ts.transpileModule(readFileSync(`lib/email/templates/${name}.ts`, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "module", "exports", js)(n => n.startsWith("@/lib/email/templates/") ? load(n.split("/").pop()) : require(n), m, m.exports);
  return (cache[name] = m.exports);
}

const app = (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.crussader.com").replace(/\/+$/, "");
const templates = {
  bienvenida: () => load("welcome").welcomeTemplate({ name: "Miguel", email: to }),
  verificar: () => load("verify-email").verifyEmailTemplate({ name: "Miguel", verifyUrl: `${app}/verify-email?token=prueba` }),
  recuperar: () => load("reset-password").resetPasswordTemplate({ name: "Miguel", resetUrl: `${app}/reset-password?token=prueba` }),
  cambiada: () => load("password-changed").passwordChangedTemplate({ name: "Miguel" }),
};
if (!templates[kind]) { console.error(`Plantilla desconocida: ${kind}`); process.exit(1); }
const t = templates[kind]();
const { data, error } = await new Resend(process.env.RESEND_API_KEY).emails.send({ from: process.env.EMAIL_FROM, to, subject: `[Prueba] ${t.subject}`, html: t.html, text: t.text });
if (error) { console.error("Resend:", error); process.exit(1); }
console.log(`Enviado «${t.subject}» a ${to} (id ${data?.id})`);
