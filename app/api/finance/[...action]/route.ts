import { NextResponse } from "next/server";
import { applyAiSettings } from "@/lib/ai/usage";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { categoryLabel, isCategory } from "@/lib/finance/categories";
import { accountsView, budgetView, packagesView, financeContext, forecast, forecastSource, listTransactions, overview } from "@/lib/finance/service";
import { payslipsView } from "@/lib/finance/payslips";
import { syncUser } from "@/lib/finance/sync";
import { bulkCorrect, classifyPending, correctTransaction } from "@/lib/finance/classify";
import { addDays, cleanView, cycleFor, forecastOccurrenceKey } from "@/lib/finance/logic";
import { conceptKey } from "@/lib/finance/plan";
import { disconnectGmail, gmailView, syncGmail } from "@/lib/finance/gmail";
import { ask, chatHistory, clearChat } from "@/lib/finance/copilot";
import { getMemory, getRules, getSettings } from "@/lib/finance/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type RouteContext = { params: Promise<{ action: string[] }> };
const headers = { "Cache-Control": "private, no-store" };
const ok = (data: unknown) => NextResponse.json(data, { headers });
const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status, headers });
const message = (e: unknown) => (e instanceof Error ? e.message.slice(0, 300) : "No se pudo completar la operación");
/** Prisma P2021: falta aplicar la migración de CRS Finance. */
const missingTables = (e: unknown) => !!e && typeof e === "object" && (e as { code?: unknown }).code === "P2021";

/** Cuenta del usuario (id), null para quitarla o false si no es suya. */
async function ownAccount(uid: string, value: unknown): Promise<string | null | false> {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return false;
  const found = await prisma.finance_accounts.findFirst({ where: { id: value, user_id: uid }, select: { id: true } });
  return found ? found.id : false;
}

async function userId() {
  return (await auth())?.user?.id ?? null;
}

export async function GET(req: Request, route: RouteContext) {
  await applyAiSettings();
  const uid = await userId();
  if (!uid) return fail("No autenticado", 401);
  const action = (await route.params).action.join("/");
  const url = new URL(req.url);
  const p = url.searchParams;
  try {
    if (action === "overview") return ok(await overview(uid, Number(p.get("cycle")) || 0));
    if (action === "transactions") return ok(await listTransactions(uid, { all: p.get("all") === "1" }));
    if (action === "forecast") {
      const amount = Number(p.get("amount"));
      return ok(await forecast(uid, { amount: Number.isFinite(amount) ? amount : null, until: p.get("until") }));
    }
    if (action === "forecast/source") {
      const key = p.get("key") ?? "";
      if (key.length > 160) return fail("Referencia no válida");
      const source = await forecastSource(uid, key);
      return source ? ok(source) : fail("No se encontró el movimiento de referencia", 404);
    }
    if (action === "budget") return ok(await budgetView(uid));
    if (action === "packages") return ok(await packagesView(uid));
    if (action === "accounts") return ok(await accountsView(uid));
    if (action === "payslips") return ok(await payslipsView(uid));
    if (action === "settings") {
      const [settings, rules, memory] = await Promise.all([getSettings(uid), getRules(uid), getMemory(uid)]);
      const hits = new Map((await prisma.finance_rules.findMany({ where: { user_id: uid }, select: { id: true, hits: true, label: true } })).map((r) => [r.id, r]));
      return ok({ settings, rules: rules.map((r) => ({ ...r, categoryLabel: categoryLabel(r.category), hits: hits.get(r.id)?.hits ?? 0, label: hits.get(r.id)?.label ?? null })), memory });
    }
    if (action === "chat") return ok({ messages: await chatHistory(uid) });
    if (action === "gmail") return ok(await gmailView(uid));
    return fail("Acción desconocida", 404);
  } catch (e) {
    if (missingTables(e)) return fail("Faltan las tablas de CRS Finance: aplica la migración 20261117170000_finance_app", 500);
    console.error(`[finance] GET ${action}`, message(e));
    return fail(message(e), 500);
  }
}

export async function POST(req: Request, route: RouteContext) {
  await applyAiSettings();
  const uid = await userId();
  if (!uid) return fail("No autenticado", 401);
  const action = (await route.params).action.join("/");
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");
  try {
    if (action === "sync") return ok(await syncUser(uid, { force: body.force === true }));
    if (action === "classify") return ok(await classifyPending(uid, { maxBatches: 2 }));
    if (action === "reclassify") {
      await prisma.finance_transactions.updateMany({ where: { user_id: uid, category_source: "auto" }, data: { category_source: "pendiente" } });
      return ok(await classifyPending(uid, { maxBatches: 2 }));
    }
    if (action === "transaction") {
      return ok(await correctTransaction(uid, str("id"), {
        category: str("category"), kind: str("kind"), extraordinary: body.extraordinary === true,
        note: typeof body.note === "string" ? body.note : undefined,
        alias: typeof body.alias === "string" ? body.alias : undefined,
        subcategory: typeof body.subcategory === "string" ? body.subcategory : undefined,
        applyToSimilar: body.applyToSimilar === true,
      }));
    }
    if (action === "budget") {
      const amount = Number(body.amount);
      const name = str("name").trim().slice(0, 60);
      const categories = Array.isArray(body.categories) ? (body.categories as unknown[]).filter(isCategory) : [];
      if (!name || !Number.isFinite(amount) || amount <= 0) return fail("Pon un nombre y un importe mayor que cero");
      const kind = body.kind === "fijo" ? "fijo" : "variable";
      const accountId = await ownAccount(uid, body.accountId);
      if (accountId === false) return fail("Cuenta no encontrada", 404);
      const id = str("id");
      const data = { name, amount, categories, kind, ...(body.accountId !== undefined ? { account_id: accountId } : {}) };
      if (id) {
        const r = await prisma.finance_budgets.updateMany({ where: { id, user_id: uid }, data });
        if (!r.count) return fail("Partida no encontrada", 404);
      } else await prisma.finance_budgets.create({ data: { user_id: uid, ...data } });
      return ok({ ok: true });
    }
    if (action === "package") {
      const name = str("name").trim().slice(0, 60);
      if (!name) return fail("Ponle un nombre al paquete");
      const ids = Array.isArray(body.txIds) ? [...new Set((body.txIds as unknown[]).filter((x): x is string => typeof x === "string"))].slice(0, 2000) : [];
      // Solo cargos de consumo del propio usuario: traspasos y aportaciones a ahorro o inversión no entran en paquetes.
      const own = ids.length ? (await prisma.finance_transactions.findMany({ where: { user_id: uid, id: { in: ids }, kind: "gasto", amount: { lt: 0 } }, select: { id: true } })).map((t) => t.id) : [];
      const concepts = Array.isArray(body.conceptKeys) ? [...new Set((body.conceptKeys as unknown[]).filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.slice(0, 80)))].slice(0, 500) : [];
      // Cada cargo solo en un paquete: nada de lo que se guarda puede estar ya en otro.
      const id = str("id");
      const others = await prisma.finance_packages.findMany({ where: { user_id: uid, ...(id ? { id: { not: id } } : {}) }, select: { name: true, tx_ids: true, concept_keys: true } });
      const conceptOf = async (ids: string[]) => ids.length
        ? (await prisma.finance_transactions.findMany({ where: { user_id: uid, id: { in: ids } }, select: { id: true, description: true, counterparty: true } }))
          .map((t) => ({ id: t.id, concept: conceptKey(t.description, t.counterparty), label: t.counterparty || t.description }))
        : [];
      const mine = await conceptOf(own);
      for (const o of others) {
        const theirs = await conceptOf(o.tx_ids);
        const clash = concepts.find((k) => o.concept_keys.includes(k) || theirs.some((t) => t.concept === k))
          ?? mine.find((t) => o.tx_ids.includes(t.id) || o.concept_keys.includes(t.concept))?.label;
        if (clash) return fail(`«${clash}» ya está en el paquete «${o.name}»: cada cargo solo puede estar en un paquete`);
      }
      const goal = body.goal === null || body.goal === undefined || body.goal === "" ? null : Number(body.goal);
      if (goal !== null && (!Number.isFinite(goal) || goal <= 0)) return fail("El objetivo debe ser un importe mayor que cero");
      const data = { name, tx_ids: own, concept_keys: concepts, goal };
      if (id) {
        const r = await prisma.finance_packages.updateMany({ where: { id, user_id: uid }, data });
        if (!r.count) return fail("Paquete no encontrado", 404);
        return ok({ id });
      }
      const created = await prisma.finance_packages.create({ data: { user_id: uid, ...data }, select: { id: true } });
      return ok(created);
    }
    if (action === "package/delete") {
      await prisma.finance_packages.deleteMany({ where: { id: str("id"), user_id: uid } });
      return ok({ ok: true });
    }
    if (action === "plan/save") {
      // Asistente «Configurar plan»: ingreso, ahorro y todas las partidas de una vez.
      const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
      const income = num(body.expectedIncome);
      const goal = num(body.savingsGoal);
      if (income !== null && (!Number.isFinite(income) || income <= 0)) return fail("Ingreso no válido");
      if (goal !== null && (!Number.isFinite(goal) || goal < 0)) return fail("Ahorro no válido");
      const incomeAccount = await ownAccount(uid, body.incomeAccountId);
      const savingsAccount = await ownAccount(uid, body.savingsAccountId);
      if (incomeAccount === false || savingsAccount === false) return fail("Cuenta no encontrada", 404);
      const raw = Array.isArray(body.budgets) ? (body.budgets as Record<string, unknown>[]).slice(0, 40) : [];
      const items: { id: string | null; name: string; amount: number; kind: string; categories: string[]; account_id: string | null; recurring_keys: string[] }[] = [];
      for (const b of raw) {
        const name = typeof b.name === "string" ? b.name.trim().slice(0, 60) : "";
        const amount = Number(b.amount);
        if (!name || !Number.isFinite(amount) || amount <= 0) return fail("Cada partida necesita un nombre y un importe mayor que cero");
        const account = await ownAccount(uid, b.accountId);
        if (account === false) return fail("Cuenta no encontrada", 404);
        items.push({
          id: typeof b.id === "string" && b.id ? b.id : null,
          name, amount,
          kind: b.kind === "fijo" ? "fijo" : "variable",
          categories: Array.isArray(b.categories) ? [...new Set((b.categories as unknown[]).filter(isCategory))] : [],
          account_id: account,
          recurring_keys: Array.isArray(b.recurringKeys) ? (b.recurringKeys as unknown[]).filter((k): k is string => typeof k === "string").map((k) => k.slice(0, 150)).slice(0, 100) : [],
        });
      }
      const keep = items.map((i) => i.id).filter((id): id is string => !!id);
      await prisma.$transaction(async (db) => {
        const settings = { expected_income: income, savings_goal: goal, savings_frequency: "mensual", income_account_id: incomeAccount, savings_account_id: savingsAccount, updated_at: new Date() };
        await db.finance_settings.upsert({ where: { user_id: uid }, create: { user_id: uid, ...settings }, update: settings });
        await db.finance_budgets.deleteMany({ where: { user_id: uid, id: { notIn: keep } } });
        for (const { id, ...data } of items) {
          if (id) {
            const r = await db.finance_budgets.updateMany({ where: { id, user_id: uid }, data });
            if (r.count) continue;
          }
          await db.finance_budgets.create({ data: { user_id: uid, ...data } });
        }
      });
      return ok({ ok: true });
    }
    if (action === "wishlist") {
      const title = str("title").trim().slice(0, 120);
      const price = Number(body.price);
      const saved = body.saved === undefined || body.saved === "" ? 0 : Number(body.saved);
      const priority = [1, 2, 3].includes(Number(body.priority)) ? Number(body.priority) : 2;
      const rawUrl = str("url").trim();
      const url = rawUrl && /^https?:\/\//i.test(rawUrl) ? rawUrl.slice(0, 500) : null;
      if (!title || !Number.isFinite(price) || price <= 0) return fail("Pon un nombre y un precio mayor que cero");
      if (!Number.isFinite(saved) || saved < 0) return fail("Importe apartado no válido");
      const purchased = typeof body.purchased === "boolean" ? { purchased_at: body.purchased ? new Date() : null } : {};
      const data = { title, price, saved, url, priority, ...purchased };
      const id = str("id");
      if (id) {
        const r = await prisma.finance_wishlist_items.updateMany({ where: { id, user_id: uid }, data });
        if (!r.count) return fail("Deseo no encontrado", 404);
      } else await prisma.finance_wishlist_items.create({ data: { user_id: uid, ...data } });
      return ok({ ok: true });
    }
    if (action === "wishlist/delete") {
      await prisma.finance_wishlist_items.deleteMany({ where: { id: str("id"), user_id: uid } });
      return ok({ ok: true });
    }
    if (action === "budget/delete") {
      await prisma.finance_budgets.deleteMany({ where: { id: str("id"), user_id: uid } });
      return ok({ ok: true });
    }
    if (action === "settings") {
      const day = Number(body.cycleStartDay);
      const goal = body.savingsGoal === null || body.savingsGoal === "" ? null : Number(body.savingsGoal);
      const data: { cycle_start_day?: number; savings_goal?: number | null; savings_frequency?: string; expected_income?: number | null; income_account_id?: string | null; savings_account_id?: string | null; updated_at: Date } = { updated_at: new Date() };
      if (body.cycleStartDay !== undefined) {
        if (!Number.isInteger(day) || day < 1 || day > 28) return fail("El ciclo debe empezar entre el día 1 y el 28");
        data.cycle_start_day = day;
      }
      if (body.savingsGoal !== undefined) {
        if (goal !== null && (!Number.isFinite(goal) || goal < 0)) return fail("Objetivo de ahorro no válido");
        data.savings_goal = goal;
      }
      if (body.expectedIncome !== undefined) {
        const income = body.expectedIncome === null || body.expectedIncome === "" ? null : Number(body.expectedIncome);
        if (income !== null && (!Number.isFinite(income) || income <= 0)) return fail("Ingreso no válido");
        data.expected_income = income;
      }
      for (const [key, column] of [["incomeAccountId", "income_account_id"], ["savingsAccountId", "savings_account_id"]] as const) {
        if (body[key] === undefined) continue;
        const accountId = await ownAccount(uid, body[key]);
        if (accountId === false) return fail("Cuenta no encontrada", 404);
        data[column] = accountId;
      }
      if (body.savingsFrequency !== undefined) {
        if (body.savingsFrequency !== "mensual" && body.savingsFrequency !== "semanal") return fail("Frecuencia no válida");
        data.savings_frequency = body.savingsFrequency;
      }
      await prisma.finance_settings.upsert({ where: { user_id: uid }, create: { user_id: uid, ...data }, update: data });
      return ok({ ok: true });
    }
    if (action === "forecast/occurrence") {
      const key = str("key");
      if (key.length > 160) return fail("Referencia no válida");
      const ctx = await financeContext(uid);
      const cycle = cycleFor(ctx.today, ctx.startDay, 1);
      let match: { date: string; label: string } | null = null;
      for (const r of ctx.recurring) {
        if (!r.active || r.kind !== "gasto" || r.amount >= 0) continue;
        let date = r.nextDate;
        while (date < cycle.start) date = addDays(date, r.intervalDays);
        while (date <= cycle.end) {
          if (forecastOccurrenceKey(r, date) === key) match = { date, label: r.label };
          date = addDays(date, r.intervalDays);
        }
      }
      if (!match) return fail("Este cargo no está previsto para el próximo ciclo", 404);
      const amount = body.amount === null ? null : Number(body.amount);
      if (amount !== null && (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000)) return fail("Importe no válido");
      const rounded = amount === null ? null : Math.round(amount * 100) / 100;
      const skipKey = `forecast-skip:${key}`;
      if (rounded === null) await prisma.$transaction([
        prisma.finance_forecast_items.deleteMany({ where: { user_id: uid, source_key: key } }),
        prisma.finance_alert_dismissals.deleteMany({ where: { user_id: uid, key: skipKey } }),
      ]);
      else if (rounded === 0) await prisma.$transaction([
        prisma.finance_forecast_items.deleteMany({ where: { user_id: uid, source_key: key } }),
        prisma.finance_alert_dismissals.upsert({ where: { user_id_key: { user_id: uid, key: skipKey } },
          create: { user_id: uid, key: skipKey }, update: {} }),
      ]);
      else await prisma.$transaction([
        prisma.finance_alert_dismissals.deleteMany({ where: { user_id: uid, key: skipKey } }),
        prisma.finance_forecast_items.upsert({
          where: { user_id_source_key: { user_id: uid, source_key: key } },
          create: { user_id: uid, title: match.label.slice(0, 100), kind: "gasto", amount: rounded,
            start_date: new Date(`${match.date}T00:00:00Z`), source: "manual", source_key: key },
          update: { amount: rounded },
        }),
      ]);
      return ok({ ok: true });
    }
    if (action === "forecast/item") {
      const id = str("id");
      const title = str("title").trim().slice(0, 100);
      const kind = str("kind");
      const amount = Number(body.amount);
      const startDate = str("startDate");
      const endDate = str("endDate") || null;
      const sourceKey = str("sourceKey") || null;
      const frequency = str("frequency") || "puntual";
      const roundedAmount = Math.round(amount * 100) / 100;
      const validDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
      if (!title || !["ingreso", "gasto"].includes(kind) || !Number.isFinite(amount) || roundedAmount <= 0 || roundedAmount > 10_000_000
        || !validDate(startDate) || (endDate !== null && (!validDate(endDate) || endDate < startDate))
        || !["puntual", "semanal", "mensual", "trimestral", "anual"].includes(frequency)) return fail("Revisa el nombre, el importe, la periodicidad y las fechas");
      if (sourceKey && (!sourceKey.startsWith("forecast-extra:") && !sourceKey.startsWith("forecast-insurance:"))) return fail("Sugerencia no válida");
      if (sourceKey && frequency !== "puntual") return fail("Una sugerencia confirmada no puede repetirse automáticamente");
      const fields = { title, kind, amount: roundedAmount, start_date: new Date(`${startDate}T00:00:00Z`),
        end_date: endDate ? new Date(`${endDate}T00:00:00Z`) : null };
      if (id) {
        const existing = await prisma.finance_forecast_items.findFirst({ where: { id, user_id: uid }, select: { source: true, source_key: true } });
        if (!existing || existing.source_key?.startsWith("rec:")) return fail("Plan no encontrado", 404);
        const repeatKey = frequency === "puntual" ? null : `plan:${frequency}:${id}`;
        const updated = await prisma.finance_forecast_items.updateMany({ where: { id, user_id: uid },
          data: { ...fields, ...(existing.source === "manual" ? { source_key: repeatKey } : {}) } });
        if (!updated.count) return fail("Plan no encontrado", 404);
      } else {
        await prisma.finance_forecast_items.create({ data: { ...fields, user_id: uid,
          source: sourceKey ? "suggested" : "manual", source_key: sourceKey ?? (frequency === "puntual" ? null : `plan:${frequency}:${crypto.randomUUID()}`) } });
      }
      return ok({ ok: true });
    }
    if (action === "forecast/item/delete") {
      await prisma.finance_forecast_items.deleteMany({ where: { id: str("id"), user_id: uid } });
      return ok({ ok: true });
    }
    if (action === "gmail/sync") return ok(await syncGmail(uid, new URL(req.url).origin));
    if (action === "gmail/disconnect") {
      await disconnectGmail(uid);
      return ok({ ok: true });
    }
    if (action === "view") {
      // Periodo y cuentas visibles: se guardan para la próxima visita (en cualquier dispositivo).
      const view = cleanView(body);
      await prisma.finance_settings.upsert({ where: { user_id: uid }, create: { user_id: uid, view }, update: { view, updated_at: new Date() } });
      return ok({ ok: true, view });
    }
    if (action === "transactions/bulk") {
      const ids = Array.isArray(body.ids) ? (body.ids as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 2000) : [];
      if (!ids.length) return fail("Selecciona algún movimiento");
      return ok(await bulkCorrect(uid, ids, {
        kind: str("kind") || undefined,
        category: str("category") || undefined,
        extraordinary: typeof body.extraordinary === "boolean" ? body.extraordinary : undefined,
        applyToSimilar: body.applyToSimilar === true,
      }));
    }
    if (action === "rule/delete") {
      await prisma.finance_rules.deleteMany({ where: { id: str("id"), user_id: uid } });
      return ok({ ok: true });
    }
    if (action === "memory") {
      const content = str("content").trim().slice(0, 400);
      if (!content) return fail("Escribe algo");
      await prisma.finance_memory.create({ data: { user_id: uid, content } });
      return ok({ ok: true });
    }
    if (action === "memory/delete") {
      await prisma.finance_memory.deleteMany({ where: { id: str("id"), user_id: uid } });
      return ok({ ok: true });
    }
    if (action === "dismiss") {
      const key = str("key").slice(0, 200);
      if (!key) return fail("Falta el aviso");
      await prisma.finance_alert_dismissals.upsert({ where: { user_id_key: { user_id: uid, key } }, create: { user_id: uid, key }, update: {} });
      return ok({ ok: true });
    }
    if (action === "recurring") {
      const key = `rec-cancel:${str("key").slice(0, 150)}`;
      if (body.cancelled === true) await prisma.finance_alert_dismissals.upsert({ where: { user_id_key: { user_id: uid, key } }, create: { user_id: uid, key }, update: {} });
      else await prisma.finance_alert_dismissals.deleteMany({ where: { user_id: uid, key } });
      return ok({ ok: true });
    }
    if (action === "account") {
      const id = str("id");
      const data: { included?: boolean; name?: string } = {};
      if (typeof body.included === "boolean") data.included = body.included;
      if (str("name").trim()) data.name = str("name").trim().slice(0, 80);
      const r = await prisma.finance_accounts.updateMany({ where: { id, user_id: uid }, data });
      if (!r.count) return fail("Cuenta no encontrada", 404);
      return ok({ ok: true });
    }
    if (action === "account/delete") {
      // Solo cuentas importadas: las bancarias se quitan desconectando el banco.
      const r = await prisma.finance_accounts.deleteMany({ where: { id: str("id"), user_id: uid, source: "import" } });
      if (!r.count) return fail("Solo se pueden borrar cuentas importadas", 400);
      return ok({ ok: true });
    }
    if (action === "chat") return ok(await ask(uid, str("question")));
    if (action === "chat/clear") {
      await clearChat(uid);
      return ok({ ok: true });
    }
    return fail("Acción desconocida", 404);
  } catch (e) {
    if (missingTables(e)) return fail("Faltan las tablas de CRS Finance: aplica la migración 20261117170000_finance_app", 500);
    console.error(`[finance] POST ${action}`, message(e));
    return fail(message(e), 500);
  }
}
