import "server-only";
// Logos de comercios (25/11/2026). Cada comercio (su clave, como «netflix» o «endesa energia») se traduce una vez, con
// la IA, a la web de la marca si es una empresa conocida; el logo lo sirve un servicio de logos por dominio. Lo que no
// es una marca (personas, bares de barrio, sociedades genéricas, traspasos) se queda con el icono de su categoría.
import { prisma } from "@/lib/prisma";
import { aiAvailable, financeJson } from "./ai";
import { merchantKey, type Tx } from "./logic";
import { loadTxs } from "./store";

const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/** Web de cada comercio ya resuelto (solo los que tienen una). */
export async function domainsFor(keys: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(keys.filter(Boolean))];
  if (!uniq.length) return new Map();
  const rows = await prisma.finance_merchant_logos.findMany({ where: { merchant_key: { in: uniq }, domain: { not: null } }, select: { merchant_key: true, domain: true } });
  return new Map(rows.map((r) => [r.merchant_key, r.domain as string]));
}

export const txMerchant = (t: Pick<Tx, "description" | "counterparty">) => merchantKey(t.description, t.counterparty);

/** Resuelve con la IA los comercios de esta persona que aún no se han mirado (los más frecuentes primero). */
export async function resolveLogos(userId: string, limit = 60) {
  if (!aiAvailable()) return { resolved: 0, pending: 0 };
  const txs = await loadTxs(userId);
  const seen = new Map<string, { n: number; sample: string; category: string }>();
  for (const t of txs) {
    const declined = Math.abs(t.amount) < 0.005;
    if (!declined && (t.kind === "interna" || t.kind === "prestamo")) continue;
    const k = declined ? merchantKey(t.description, null) : txMerchant(t);
    if (!k || k.length < 3) continue;
    const x = seen.get(k) ?? { n: 0, sample: `${t.description}${t.counterparty ? ` | ${t.counterparty}` : ""}`, category: t.category };
    x.n += 1;
    seen.set(k, x);
  }
  const done = new Set((await prisma.finance_merchant_logos.findMany({ where: { merchant_key: { in: [...seen.keys()] } }, select: { merchant_key: true } })).map((r) => r.merchant_key));
  const todo = [...seen.entries()].filter(([k]) => !done.has(k)).sort((a, b) => b[1].n - a[1].n);
  const batch = todo.slice(0, limit);
  if (!batch.length) return { resolved: 0, pending: 0 };
  const out = await financeJson<{ items: { i: number; domain: string; sure: boolean }[] }>({
    tier: "fast",
    schemaName: "webs_de_comercios",
    instructions: [
      "Te paso comercios de movimientos bancarios de una persona en España. Para cada uno, di la web principal de la marca si es una empresa conocida (nacional o internacional): netflix.com, mercadona.es, endesa.com, movistar.es, amazon.es, ryanair.com, mapfre.es…",
      "Usa el dominio de la marca que el usuario reconocería (para España, el .es si es el principal allí). Solo el dominio, sin https ni rutas.",
      "Pon domain vacío y sure=false si no es una marca conocida o no estás seguro: personas (Bizums, transferencias a alguien), bares y tiendas de barrio, sociedades con nombre genérico, comunidades de vecinos, cajeros, comisiones, traspasos entre cuentas, conceptos ilegibles. No adivines.",
      "Responde con un elemento por cada línea de entrada (campo i = índice).",
    ].join("\n"),
    input: `índice\tcomercio\tejemplo de concepto\tcategoría\n${batch.map(([k, x], i) => `${i}\t${k}\t${x.sample.slice(0, 120)}\t${x.category}`).join("\n")}`,
    schema: {
      type: "object", additionalProperties: false, required: ["items"],
      properties: { items: { type: "array", items: { type: "object", additionalProperties: false, required: ["i", "domain", "sure"], properties: { i: { type: "integer" }, domain: { type: "string" }, sure: { type: "boolean" } } } } },
    },
    maxOutputTokens: 4000,
  });
  const byI = new Map((out.items ?? []).map((r) => [r.i, r]));
  const data = batch.map(([k], i) => {
    const r = byI.get(i);
    const d = (r?.domain ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
    return { merchant_key: k, domain: r?.sure && DOMAIN.test(d) ? d : null };
  });
  await prisma.finance_merchant_logos.createMany({ data, skipDuplicates: true });
  return { resolved: data.filter((d) => d.domain).length, pending: Math.max(0, todo.length - batch.length) };
}
