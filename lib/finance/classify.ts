// lib/finance/classify.ts
// Entender cada movimiento: 1) reglas aprendidas del usuario, 2) transferencias entre cuentas propias,
// 3) palabras clave de comercios, 4) IA con el contexto personal, 5) lo que quede, por signo.
// Lo que corrige el usuario («usuario») no se vuelve a tocar nunca.
import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { CATEGORIES, KINDS, categoryOf, isCategory, isKind } from "./categories";
import { addDays, fallbackClass, findTransferPairs, holderTokens, isOwnName, keywordClass, matchRule, normalize, rulePattern, todayIso, type Rule, type Tx } from "./logic";
import { aiAvailable, financeJson } from "./ai";
import { getAccounts, getMemory, getRules, loadTxs } from "./store";

const LOCKED = new Set(["usuario"]);
const AI_BATCH = 60;
const AI_MAX_BATCHES = 2;
/** Un gasto suelto de este tamaño se marca como extraordinario (no se proyecta); el usuario puede cambiarlo. */
const EXTRAORDINARY_FROM = 2000;
const isBig = (amount: number) => amount <= -EXTRAORDINARY_FROM;

async function setClass(ids: string[], data: { category: string; kind: string; category_source: string; extraordinary?: boolean; transfer_pair_id?: string | null }) {
  if (!ids.length) return;
  await prisma.finance_transactions.updateMany({ where: { id: { in: ids } }, data: { ...data, updated_at: new Date() } });
}

/** Clasifica lo pendiente (y revisa transferencias recientes). Devuelve cuántos movimientos ha tocado cada paso. */
/**
 * `useAi: false` hace solo lo rápido (reglas, palabras, transferencias) y deja el resto pendiente para la IA.
 * Con IA, cada llamada procesa como mucho `maxBatches` tandas: la pantalla repite hasta que no quede nada.
 */
export async function classifyPending(userId: string, opts: { useAi?: boolean; maxBatches?: number } = {}) {
  const useAi = opts.useAi ?? true;
  const maxBatches = opts.maxBatches ?? AI_MAX_BATCHES;
  const [accounts, rules] = await Promise.all([getAccounts(userId), getRules(userId)]);
  const since = addDays(todayIso(), -400);
  const txs = await loadTxs(userId, { since, includeExcluded: true });
  const stats = { reglas: 0, internas: 0, palabras: 0, ia: 0, auto: 0, remaining: 0 };
  const holder = holderTokens(accounts.filter((a) => a.source === "bank").map((a) => a.name));
  const bankOfAccount = new Map(accounts.map((a) => [a.id, a.bank]));

  // 1) Reglas del usuario y palabras clave sobre lo pendiente.
  const ownHashes = new Set(accounts.map((a) => a.ibanHash).filter((h): h is string => !!h));
  const left: Tx[] = [];
  for (const t of txs.filter((x) => x.source === "pendiente")) {
    const rule = matchRule(t, rules);
    if (rule) {
      await applyRuleTo([t.id], rule);
      Object.assign(t, { source: "regla", kind: rule.kind, category: rule.category });
      stats.reglas++;
      continue;
    }
    const k = keywordClass(t);
    // Nómina, devoluciones, inversión y traspasos explícitos mandan sobre todo lo demás.
    const strong = k && k.kind !== "gasto";
    // Traspaso a uno mismo (otro banco) o recarga de Revolut desde Santander/BBVA: entre cuentas propias.
    const own = !strong && (isOwnName(t.counterparty, holder) || isOwnName(t.description, holder));
    const revolutTopUp = !strong && bankOfAccount.get(t.accountId) !== "revolut" && /\brevolut\b/.test(normalize(t.description));
    if (own || revolutTopUp) {
      await setClass([t.id], { category: "transferencia_interna", kind: "interna", category_source: "interna" });
      Object.assign(t, { source: "interna", kind: "interna", category: "transferencia_interna" });
      stats.internas++;
      continue;
    }
    if (k) {
      await setClass([t.id], { category: k.category, kind: k.kind, category_source: "palabra", extraordinary: k.kind === "gasto" && isBig(t.amount) });
      Object.assign(t, { source: "palabra", kind: k.kind, category: k.category });
      stats.palabras++;
      continue;
    }
    left.push(t);
  }

  // 2) Transferencias internas: pareja salida/entrada del mismo importe entre cuentas propias.
  // Compras con comercio reconocido (palabra clave o regla) no se emparejan: un importe igual sería casualidad.
  const candidates = txs.filter((t) => !LOCKED.has(t.source) && !t.transferPairId && t.source !== "regla" && (t.source !== "palabra" || t.kind === "interna"));
  const paired = new Set<string>();
  for (const p of findTransferPairs(candidates)) {
    await setClass([p.outId, p.inId], { category: "transferencia_interna", kind: "interna", category_source: "interna", transfer_pair_id: randomUUID(), extraordinary: false });
    paired.add(p.outId);
    paired.add(p.inId);
    stats.internas += 2;
  }

  // 3) Transferencia a un IBAN propio aunque la otra cuenta no esté conectada.
  const toAi: Tx[] = [];
  for (const t of left) {
    if (paired.has(t.id)) continue;
    if (t.counterpartyIbanHash && ownHashes.has(t.counterpartyIbanHash)) {
      await setClass([t.id], { category: "transferencia_interna", kind: "interna", category_source: "interna" });
      stats.internas++;
      continue;
    }
    toAi.push(t);
  }

  let rest = toAi;
  if (useAi && aiAvailable() && toAi.length) {
    const memory = (await getMemory(userId)).map((m) => `- ${m.content}`).join("\n");
    const bankOf = new Map(accounts.map((a) => [a.id, `${a.bank ?? "importada"} · ${a.name}`]));
    const done = new Set<string>();
    let aiFailed = false;
    for (let b = 0; b < maxBatches && b * AI_BATCH < toAi.length; b++) {
      const batch = toAi.slice(b * AI_BATCH, (b + 1) * AI_BATCH);
      try {
        const result = await aiClassify(batch, bankOf, memory, accounts.map((a) => `${a.bank ?? "importada"} · ${a.name}`));
        for (const r of result) {
          const t = batch[r.i];
          if (!t || done.has(t.id) || !isCategory(r.category) || !isKind(r.kind)) continue;
          await setClass([t.id], { category: r.category, kind: r.kind, category_source: "ia", extraordinary: r.extraordinary || (r.kind === "gasto" && isBig(t.amount)) });
          done.add(t.id);
          stats.ia++;
        }
      } catch (e) {
        console.error("[finance] clasificación con IA", e instanceof Error ? e.message.slice(0, 200) : e);
        aiFailed = true;
        break;
      }
    }
    // Lo que no ha cabido en esta llamada queda pendiente para la siguiente.
    const processed = new Set(toAi.slice(0, maxBatches * AI_BATCH).map((t) => t.id));
    rest = toAi.filter((t) => !done.has(t.id) && (aiFailed || processed.has(t.id)));
    stats.remaining = toAi.filter((t) => !done.has(t.id) && !processed.has(t.id) && !aiFailed).length;
  } else if (!useAi) {
    // Sin IA en esta pasada: lo que queda sigue pendiente (no se da por «sin entender» todavía).
    stats.remaining = toAi.length;
    rest = [];
  }
  for (const t of rest) {
    const f = fallbackClass(t.amount);
    await setClass([t.id], { category: f.category, kind: f.kind, category_source: "auto", extraordinary: f.kind === "gasto" && isBig(t.amount) });
    stats.auto++;
  }
  return stats;
}

async function applyRuleTo(ids: string[], rule: Rule) {
  await setClass(ids, { category: rule.category, kind: rule.kind, category_source: "regla", extraordinary: rule.extraordinary });
  await prisma.finance_rules.update({ where: { id: rule.id }, data: { hits: { increment: ids.length } } }).catch(() => undefined);
}

type AiRow = { i: number; category: string; kind: string; extraordinary: boolean };

async function aiClassify(batch: Tx[], bankOf: Map<string, string>, memory: string, ownAccounts: string[]) {
  const categories = CATEGORIES.filter((c) => c.key !== "sin_clasificar");
  const lines = batch.map((t, i) => `${i}\t${t.date}\t${t.amount.toFixed(2)}\t${bankOf.get(t.accountId) ?? ""}\t${t.description}${t.counterparty ? ` | ${t.counterparty}` : ""}`);
  const out = await financeJson<{ items: AiRow[] }>({
    tier: "fast",
    schemaName: "clasificacion_movimientos",
    instructions: [
      "Clasificas movimientos bancarios de una persona en España. Para cada uno das su categoría y su significado económico real (kind).",
      "kind: gasto (sale dinero de verdad), ingreso (ingreso ordinario: nómina, intereses), regalo (dinero recibido que no es ingreso ordinario, p. ej. Bizum de un familiar por un cumpleaños), devolucion (reembolso de un gasto; categoría = la del gasto que devuelve), interna (entre cuentas propias de la persona, recargas de Revolut, traspasos), ahorro (aportación a inversión, bróker, exchange cripto o fondo).",
      "Importe negativo = sale de la cuenta; positivo = entra. Un Bizum o transferencia saliente a otra persona suele ser gasto (categoría según el concepto, o regalos si lo indica). Uno entrante de otra persona: devolucion si parece pagar su parte de algo, regalo si lo indica el concepto, si no otros_ingresos.",
      "extraordinary=true solo si es claramente puntual y no debe proyectarse (una compra grande excepcional, una multa, un viaje concreto).",
      `Categorías válidas: ${categories.map((c) => `${c.key} (${c.label}, ${c.kind})`).join(", ")}.`,
      `Cuentas propias de la persona (el nombre es el del titular): ${ownAccounts.join("; ") || "—"}. Una transferencia a o desde el propio titular es interna; a o desde familiares con apellidos parecidos, no.`,
      `Gastos sueltos muy grandes (más de ${EXTRAORDINARY_FROM} €: una obra, una compra de vivienda, una donación) son extraordinary=true.`,
      memory ? `Contexto que la persona ha contado:\n${memory}` : "",
      "Responde con un elemento por cada línea de entrada (campo i = índice).",
    ].filter(Boolean).join("\n"),
    input: `índice\tfecha\timporte\tcuenta\tconcepto\n${lines.join("\n")}`,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["items"],
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["i", "category", "kind", "extraordinary"],
            properties: {
              i: { type: "integer" },
              category: { type: "string", enum: categories.map((c) => c.key) },
              kind: { type: "string", enum: [...KINDS] },
              extraordinary: { type: "boolean" },
            },
          },
        },
      },
    },
    maxOutputTokens: 6000,
  });
  return out.items ?? [];
}

/**
 * Corrección del usuario: fija el movimiento y, si se pide, crea (o actualiza) una regla con su comercio y la
 * aplica a todos los movimientos parecidos que no haya corregido a mano. Si deja de ser una transferencia
 * interna, se deshace la pareja y la otra mitad se vuelve a clasificar.
 */
export async function correctTransaction(userId: string, id: string, input: { category: string; kind: string; extraordinary: boolean; note?: string | null; applyToSimilar: boolean }) {
  if (!isCategory(input.category) || !isKind(input.kind)) throw new Error("Categoría no válida");
  const row = await prisma.finance_transactions.findFirst({ where: { id, user_id: userId } });
  if (!row) throw new Error("Movimiento no encontrado");
  const category = input.kind === "interna" ? "transferencia_interna" : input.kind === "ahorro" && categoryOf(input.category).kind !== "ahorro" ? "ahorro_inversion" : input.category;
  let pair = row.transfer_pair_id;
  if (pair && input.kind !== "interna") {
    await prisma.finance_transactions.updateMany({ where: { user_id: userId, transfer_pair_id: pair, id: { not: id }, category_source: { not: "usuario" } }, data: { transfer_pair_id: null, category_source: "pendiente", updated_at: new Date() } });
    await prisma.finance_transactions.updateMany({ where: { user_id: userId, transfer_pair_id: pair, id: { not: id } }, data: { transfer_pair_id: null } });
    pair = null;
  }
  await prisma.finance_transactions.update({
    where: { id },
    data: {
      category,
      kind: input.kind,
      extraordinary: input.extraordinary,
      category_source: "usuario",
      transfer_pair_id: pair,
      note: input.note === undefined ? row.note : input.note?.trim().slice(0, 500) || null,
      updated_at: new Date(),
    },
  });
  let similar = 0;
  let pattern: string | null = null;
  if (input.applyToSimilar) {
    const found = rulePattern({ description: row.description, counterparty: row.counterparty });
    pattern = found;
    if (found) {
      const pattern = found;
      const rule = await prisma.finance_rules.upsert({
        where: { user_id_pattern: { user_id: userId, pattern } },
        create: { user_id: userId, pattern, category, kind: input.kind, extraordinary: input.extraordinary, label: row.counterparty || row.description.slice(0, 80) },
        update: { category, kind: input.kind, extraordinary: input.extraordinary },
      });
      const all = await loadTxs(userId, { includeExcluded: true });
      const ids = all
        .filter((t) => t.id !== id && t.source !== "usuario" && !t.transferPairId && matchRule(t, [{ id: rule.id, pattern, category, kind: input.kind as Rule["kind"], extraordinary: input.extraordinary }]))
        .map((t) => t.id);
      if (ids.length) await applyRuleTo(ids, { id: rule.id, pattern, category, kind: input.kind as Rule["kind"], extraordinary: input.extraordinary });
      similar = ids.length;
    }
  }
  await classifyPending(userId, { useAi: false });
  return { ok: true, similar, pattern };
}
