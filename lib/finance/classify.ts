// lib/finance/classify.ts
// Entender cada movimiento: 1) reglas aprendidas del usuario, 2) transferencias entre cuentas propias,
// 3) palabras clave de comercios, 4) IA con el contexto personal, 5) lo que quede, por signo.
// Lo que corrige el usuario («usuario») no se vuelve a tocar nunca.
import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { CATEGORIES, KINDS, categoryOf, isCategory, isKind } from "./categories";
import { addDays, fallbackClass, findTransferPairs, holderTokens, isOwnBankTransfer, isOwnName, keywordClass, matchRule, normalize, rulePattern, todayIso, type Rule, type Tx } from "./logic";
import { aiAvailable, financeJson } from "./ai";
import { getAccounts, getMemory, getRules, loadTxs } from "./store";

const LOCKED = new Set(["usuario"]);
const AI_BATCH = 60;
const AI_MAX_BATCHES = 2;
/** Un gasto suelto de este tamaño se marca como extraordinario (no se proyecta); el usuario puede cambiarlo. */
const EXTRAORDINARY_FROM = 2000;
const isBig = (amount: number) => amount <= -EXTRAORDINARY_FROM;

async function setClass(ids: string[], data: { category: string; kind: string; category_source: string; extraordinary?: boolean; transfer_pair_id?: string | null; alias?: string | null; subcategory?: string | null }) {
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
  const holder = holderTokens(accounts.filter((a) => a.source === "bank").map((a) => a.holderName ?? a.name));
  const bankOfAccount = new Map(accounts.map((a) => [a.id, a.bank]));
  const ownBanks = new Set(accounts.map((a) => normalize(a.bank ?? "")).filter((b) => b.length > 2));

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
    // «Hipoteca» u «IBI» en el concepto no lo convierten en gasto si va a otra cuenta suya: el gasto real
    // es el cargo que luego hace el otro banco (si no, la hipoteca contaría dos veces).
    const own = !strong && (isOwnName(t.counterparty, holder) || isOwnName(t.description, holder) || isOwnBankTransfer(t.description, holder, ownBanks));
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
        const result = await aiClassify(batch, bankOf, memory, accounts.map((a) => `${a.bank ?? "importada"} · ${a.name}${a.holderName ? ` (titular: ${a.holderName})` : ""}`));
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
  await setClass(ids, { category: rule.category, kind: rule.kind, category_source: "regla", extraordinary: rule.extraordinary, alias: rule.alias, subcategory: rule.subcategory });
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
export async function correctTransaction(userId: string, id: string, input: { category: string; kind: string; extraordinary: boolean; note?: string | null; alias?: string | null; subcategory?: string | null; applyToSimilar: boolean }) {
  if (!isCategory(input.category) || !isKind(input.kind)) throw new Error("Categoría no válida");
  const row = await prisma.finance_transactions.findFirst({ where: { id, user_id: userId } });
  if (!row) throw new Error("Movimiento no encontrado");
  const alias = input.alias === undefined ? row.alias : input.alias?.trim().slice(0, 80) || null;
  const subcategory = input.subcategory === undefined ? row.subcategory : input.subcategory?.trim().slice(0, 80) || null;
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
      alias,
      subcategory,
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
        create: { user_id: userId, pattern, category, alias, subcategory, kind: input.kind, extraordinary: input.extraordinary, label: row.counterparty || row.description.slice(0, 80) },
        update: { category, alias, subcategory, kind: input.kind, extraordinary: input.extraordinary },
      });
      const all = await loadTxs(userId, { includeExcluded: true });
      const ids = all
        .filter((t) => t.id !== id && t.source !== "usuario" && !t.transferPairId && matchRule(t, [{ id: rule.id, pattern, category, kind: input.kind as Rule["kind"], extraordinary: input.extraordinary }]))
        .map((t) => t.id);
      if (ids.length) await applyRuleTo(ids, { id: rule.id, pattern, category, alias, subcategory, kind: input.kind as Rule["kind"], extraordinary: input.extraordinary });
      similar = ids.length;
    }
  }
  await classifyPending(userId, { useAi: false });
  return { ok: true, similar, pattern };
}

/**
 * Cambia varios movimientos a la vez (tipo, categoría o extraordinario). Con `applyToSimilar`, cada comercio
 * distinto de la selección se guarda como regla y se aplica a sus parecidos, igual que una corrección suelta.
 */
export async function bulkCorrect(userId: string, ids: string[], input: { kind?: string; category?: string; extraordinary?: boolean; applyToSimilar: boolean }) {
  if (input.kind !== undefined && !isKind(input.kind)) throw new Error("Tipo no válido");
  if (input.category !== undefined && !isCategory(input.category)) throw new Error("Categoría no válida");
  if (input.kind === undefined && input.category === undefined && input.extraordinary === undefined) throw new Error("No hay nada que cambiar");
  const rows = await prisma.finance_transactions.findMany({ where: { user_id: userId, id: { in: ids } } });
  let changed = 0;
  const patterns = new Map<string, { category: string; kind: string; extraordinary: boolean; label: string }>();
  for (const row of rows) {
    // Solo categoría: el tipo la sigue (una devolución sigue siendo devolución si la categoría es de gasto).
    const catKind = input.category ? categoryOf(input.category).kind : null;
    const kind = input.kind ?? (catKind && !(catKind === "gasto" && row.kind === "devolucion") ? catKind : row.kind);
    // El tipo manda sobre la categoría cuando no casan (una transferencia interna no tiene categoría de gasto).
    let category = input.category ?? row.category;
    if (kind === "interna") category = "transferencia_interna";
    else if (kind === "ahorro" && categoryOf(category).kind !== "ahorro") category = "ahorro_inversion";
    else if (input.kind && input.category === undefined && categoryOf(category).kind !== kind && (category === "transferencia_interna" || category === "ahorro_inversion")) {
      category = kind === "ingreso" || kind === "regalo" ? "otros_ingresos" : "otros_gastos";
    }
    const extraordinary = input.extraordinary ?? row.extraordinary;
    let pair = row.transfer_pair_id;
    if (pair && kind !== "interna") {
      await prisma.finance_transactions.updateMany({ where: { user_id: userId, transfer_pair_id: pair, id: { notIn: ids }, category_source: { not: "usuario" } }, data: { transfer_pair_id: null, category_source: "pendiente", updated_at: new Date() } });
      await prisma.finance_transactions.updateMany({ where: { user_id: userId, transfer_pair_id: pair, id: { notIn: ids } }, data: { transfer_pair_id: null } });
      pair = null;
    }
    await prisma.finance_transactions.update({
      where: { id: row.id },
      data: { kind, category, extraordinary, category_source: "usuario", transfer_pair_id: pair, updated_at: new Date() },
    });
    changed++;
    if (input.applyToSimilar) {
      const pattern = rulePattern({ description: row.description, counterparty: row.counterparty });
      if (pattern) patterns.set(pattern, { category, kind, extraordinary, label: row.counterparty || row.description.slice(0, 80) });
    }
  }
  let similar = 0;
  if (patterns.size) {
    const all = await loadTxs(userId, { includeExcluded: true });
    const selected = new Set(ids);
    for (const [pattern, r] of patterns) {
      const rule = await prisma.finance_rules.upsert({
        where: { user_id_pattern: { user_id: userId, pattern } },
        create: { user_id: userId, pattern, category: r.category, kind: r.kind, extraordinary: r.extraordinary, label: r.label },
        update: { category: r.category, kind: r.kind, extraordinary: r.extraordinary },
      });
      const asRule: Rule = { id: rule.id, pattern, category: r.category, kind: r.kind as Rule["kind"], extraordinary: r.extraordinary };
      const targets = all.filter((t) => !selected.has(t.id) && t.source !== "usuario" && !t.transferPairId && matchRule(t, [asRule])).map((t) => t.id);
      if (targets.length) await applyRuleTo(targets, asRule);
      similar += targets.length;
    }
  }
  await classifyPending(userId, { useAi: false });
  return { ok: true, changed, similar, rules: patterns.size };
}

// ---------------------------------------------------------------------------------------------------------
// Detalle de un movimiento: llevar sus cambios a los parecidos (mismo comercio), con vista previa y deshacer
// ---------------------------------------------------------------------------------------------------------
export type SimilarField = "category" | "alias" | "subcategory";

/** Movimientos parecidos a uno (mismo comercio, sin los corregidos a mano ni las transferencias emparejadas). */
async function similarTo(userId: string, id: string) {
  const row = await prisma.finance_transactions.findFirst({ where: { id, user_id: userId } });
  if (!row) throw new Error("Movimiento no encontrado");
  const pattern = rulePattern({ description: row.description, counterparty: row.counterparty });
  if (!pattern) return { row, pattern: null, ids: [] as string[] };
  const probe: Rule = { id: "probe", pattern, category: row.category, kind: (isKind(row.kind) ? row.kind : "gasto"), extraordinary: false };
  const all = await loadTxs(userId, { includeExcluded: true });
  const ids = all.filter((t) => t.id !== id && t.source !== "usuario" && !t.transferPairId && matchRule(t, [probe])).map((t) => t.id);
  return { row, pattern, ids };
}

/** Cuántos parecidos tiene un movimiento (para preguntar «¿aplicar a los 13 de …?» antes de hacerlo). */
export async function similarCount(userId: string, id: string) {
  const { row, ids } = await similarTo(userId, id);
  return { count: ids.length, label: row.alias || row.counterparty || row.description };
}

/**
 * Lleva a los parecidos solo los campos pedidos (categoría —con su tipo—, alias, subcategoría) y los guarda como
 * regla para los que lleguen. Nunca copia «extraordinario» ni la nota: son de cada movimiento. Devuelve lo
 * necesario para deshacerlo.
 */
export async function applyToSimilarFields(userId: string, id: string, fields: SimilarField[]) {
  const { row, pattern, ids } = await similarTo(userId, id);
  if (!pattern || !fields.length) return { count: 0, undo: null };
  const before = ids.length
    ? await prisma.finance_transactions.findMany({ where: { user_id: userId, id: { in: ids } }, select: { id: true, category: true, kind: true, alias: true, subcategory: true, category_source: true } })
    : [];
  const prevRule = await prisma.finance_rules.findUnique({ where: { user_id_pattern: { user_id: userId, pattern } } });
  const data: { category?: string; kind?: string; alias?: string | null; subcategory?: string | null } = {};
  if (fields.includes("category")) { data.category = row.category; data.kind = row.kind; }
  if (fields.includes("alias")) data.alias = row.alias;
  if (fields.includes("subcategory")) data.subcategory = row.subcategory;
  await prisma.finance_rules.upsert({
    where: { user_id_pattern: { user_id: userId, pattern } },
    create: { user_id: userId, pattern, category: row.category, kind: row.kind, extraordinary: false, alias: data.alias ?? null, subcategory: data.subcategory ?? null, label: row.counterparty || row.description.slice(0, 80) },
    update: data,
  });
  if (ids.length) {
    await prisma.finance_transactions.updateMany({ where: { user_id: userId, id: { in: ids } }, data: { ...data, category_source: "regla", updated_at: new Date() } });
  }
  return {
    count: ids.length,
    undo: {
      pattern,
      rule: prevRule ? { category: prevRule.category, kind: prevRule.kind, alias: prevRule.alias, subcategory: prevRule.subcategory } : null,
      rows: before.map((b) => ({ id: b.id, category: b.category, kind: b.kind, alias: b.alias, subcategory: b.subcategory, source: b.category_source })),
    },
  };
}

type SimilarUndo = NonNullable<Awaited<ReturnType<typeof applyToSimilarFields>>["undo"]>;

/** Deshace applyToSimilarFields: deja cada movimiento y la regla como estaban. */
export async function undoSimilar(userId: string, undo: SimilarUndo) {
  const rows = (undo.rows ?? []).slice(0, 5000);
  const own = new Set((await prisma.finance_transactions.findMany({ where: { user_id: userId, id: { in: rows.map((r) => r.id) } }, select: { id: true } })).map((r) => r.id));
  for (const r of rows) {
    if (!own.has(r.id) || !isCategory(r.category) || !isKind(r.kind)) continue;
    await prisma.finance_transactions.update({ where: { id: r.id }, data: { category: r.category, kind: r.kind, alias: r.alias, subcategory: r.subcategory, category_source: r.source, updated_at: new Date() } });
  }
  if (typeof undo.pattern === "string") {
    if (undo.rule && isCategory(undo.rule.category) && isKind(undo.rule.kind)) {
      await prisma.finance_rules.updateMany({ where: { user_id: userId, pattern: undo.pattern }, data: { category: undo.rule.category, kind: undo.rule.kind, alias: undo.rule.alias, subcategory: undo.rule.subcategory } });
    } else if (!undo.rule) {
      await prisma.finance_rules.deleteMany({ where: { user_id: userId, pattern: undo.pattern } });
    }
  }
  return { ok: true };
}
