// lib/finance/service.ts
// Lo que piden las pantallas y el copiloto: todo calculado con logic.ts sobre los datos guardados.
import "server-only";
import { prisma } from "@/lib/prisma";
import { isBankingConfigured, BANK_LABELS, PERSONAL_BANKS } from "@/lib/personal-finance/enable-banking";
import {
  affordability, budgetStatus, cycleFor, daysBetween, detectAlerts, detectRecurring, liquiditySeries, merchantKey,
  normalize, projectCycle, projectSavings, summarize, todayIso, type Alert, type CycleSummary, type Tx,
} from "./logic";
import { getAccounts, getBudgets, getDismissed, getSettings, loadTxs } from "./store";
import { AUTO_SYNC_HOURS } from "./sync";

const HISTORY_CYCLES = 12;

/** Contexto común: datos y cálculos base de una persona (una sola lectura de la base de datos). */
export async function financeContext(userId: string) {
  const [settings, accounts, txs, budgets, { dismissed, cancelled }] = await Promise.all([
    getSettings(userId),
    getAccounts(userId),
    loadTxs(userId),
    getBudgets(userId),
    getDismissed(userId),
  ]);
  const today = todayIso();
  const startDay = settings.cycleStartDay;
  const recurring = detectRecurring(txs, today, cancelled);
  const recurringKeys = new Set(recurring.filter((r) => r.active).map((r) => r.key));
  const history: CycleSummary[] = [];
  for (let o = 1; o <= HISTORY_CYCLES; o++) history.push(summarize(txs, cycleFor(today, startDay, -o), recurringKeys));
  const oldest = txs.length ? txs[txs.length - 1].date : today;
  const historyWithData = history.filter((h) => h.cycle.end >= oldest);
  const current = summarize(txs, cycleFor(today, startDay), recurringKeys);
  const included = accounts.filter((a) => a.included);
  const eur = included.filter((a) => a.currency === "EUR" && a.balance !== null);
  const liquidity = eur.length ? Math.round(eur.reduce((s, a) => s + (a.balance ?? 0), 0) * 100) / 100 : null;
  const projection = projectCycle({ txs, today, startDay, liquidity, recurring, savingsGoal: settings.savingsGoal, history: historyWithData });
  const budgetsNow = budgetStatus(budgets, current, today);
  return { userId, settings, accounts, txs, budgets, budgetsNow, dismissed, cancelled, today, startDay, recurring, history: historyWithData, current, liquidity, projection };
}
export type FinanceContext = Awaited<ReturnType<typeof financeContext>>;

async function connectionAlerts(userId: string): Promise<Alert[]> {
  const conns = await prisma.personal_bank_connections.findMany({ where: { user_id: userId }, select: { bank: true, institution_name: true, consent_expires_at: true } });
  const out: Alert[] = [];
  for (const c of conns) {
    const days = Math.ceil((c.consent_expires_at.getTime() - Date.now()) / 86_400_000);
    if (days <= 0) out.push({ key: `consent:${c.bank}:${c.consent_expires_at.toISOString().slice(0, 10)}:caducado`, level: "importante", title: `${c.institution_name}: hay que renovar el acceso`, body: "El permiso de lectura ha caducado y ya no entran movimientos nuevos. Renuévalo en Conexiones." });
    else if (days <= 10) out.push({ key: `consent:${c.bank}:${c.consent_expires_at.toISOString().slice(0, 10)}`, level: "aviso", title: `${c.institution_name}: el acceso caduca en ${days} ${days === 1 ? "día" : "días"}`, body: "Renuévalo en Conexiones para que sigan entrando los movimientos." });
  }
  return out;
}

/** Inicio: el ciclo, la previsión, categorías, evolución, presupuestos y avisos. */
export async function overview(userId: string) {
  const ctx = await financeContext(userId);
  const { txs, today, recurring, history, current, projection, budgetsNow, accounts, settings } = ctx;
  const alerts = [...(await connectionAlerts(userId)), ...detectAlerts({ txs, today, recurring, history, current, budgets: budgetsNow })]
    .filter((a) => !ctx.dismissed.has(a.key));
  const prev = history[0] ?? null;
  const cycleDates = [...history].reverse().map((h) => h.cycle.end).concat(today);
  const pendingReview = txs.filter((t) => t.source === "auto" || t.source === "pendiente").length;
  const pendingClassify = txs.filter((t) => t.source === "pendiente").length;
  const syncDue = !settings.lastSyncAt || Date.now() - new Date(settings.lastSyncAt).getTime() > AUTO_SYNC_HOURS * 3_600_000;
  return {
    today,
    settings,
    hasData: txs.length > 0,
    syncDue,
    liquidity: ctx.liquidity,
    accounts: accounts.map(({ ibanHash: _h, ...a }) => a),
    current,
    previous: prev,
    history: [...history].reverse().map((h) => ({ cycle: h.cycle, income: h.income, gifts: h.gifts, expenses: h.expenses, net: h.net, savedToInvestments: h.savedToInvestments })),
    liquiditySeries: liquiditySeries(accounts.filter((a) => a.included), txs, cycleDates),
    projection,
    budgets: budgetsNow,
    alerts: alerts.slice(0, 12),
    pendingReview,
    pendingClassify,
    upcoming: projection.pending.slice(0, 8),
  };
}

export type TxFilters = { cycle?: number; q?: string; category?: string; kind?: string; account?: string; review?: boolean; limit?: number };

/** Movimientos de un ciclo (o buscando en todo), con sus totales. */
export async function listTransactions(userId: string, f: TxFilters) {
  const settings = await getSettings(userId);
  const today = todayIso();
  const all = await loadTxs(userId, { includeExcluded: true });
  const accounts = await getAccounts(userId);
  const accName = new Map(accounts.map((a) => [a.id, { name: a.name, bank: a.bank, included: a.included }]));
  const notes = new Map((await prisma.finance_transactions.findMany({ where: { user_id: userId, note: { not: null } }, select: { id: true, note: true } })).map((n) => [n.id, n.note]));
  const searching = !!(f.q && f.q.trim());
  const cycle = cycleFor(today, settings.cycleStartDay, f.cycle ?? 0);
  const q = searching ? normalize(f.q!) : "";
  const rows = all.filter((t) =>
    (searching ? normalize(`${t.description} ${t.counterparty ?? ""}`).includes(q) : t.date >= cycle.start && t.date <= cycle.end) &&
    (!f.category || t.category === f.category) &&
    (!f.kind || t.kind === f.kind) &&
    (!f.account || t.accountId === f.account) &&
    (!f.review || t.source === "auto" || t.source === "pendiente"));
  const totals = { income: 0, expenses: 0, internal: 0, saved: 0 };
  for (const t of rows) {
    if (accName.get(t.accountId)?.included === false) continue;
    if (t.kind === "ingreso" || t.kind === "regalo") totals.income += t.amount;
    else if (t.kind === "gasto" || t.kind === "devolucion") totals.expenses -= t.amount;
    else if (t.kind === "interna") totals.internal += Math.abs(t.amount) / 2;
    else if (t.kind === "ahorro") totals.saved -= t.amount;
  }
  const limit = Math.min(f.limit ?? 400, 1000);
  return {
    cycle: searching ? null : cycle,
    cycleOffset: f.cycle ?? 0,
    count: rows.length,
    totals: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, Math.round(v * 100) / 100])),
    items: rows.slice(0, limit).map((t) => ({
      ...t,
      account: accName.get(t.accountId)?.name ?? "—",
      bank: accName.get(t.accountId)?.bank ?? null,
      note: notes.get(t.id) ?? null,
    })),
  };
}

/** Previsión detallada: el ciclo, «¿me lo puedo permitir?» y el ahorro hasta una fecha. */
export async function forecast(userId: string, opts: { amount?: number | null; until?: string | null }) {
  const ctx = await financeContext(userId);
  const until = opts.until && /^\d{4}-\d{2}-\d{2}$/.test(opts.until) ? opts.until : cycleFor(ctx.today, ctx.startDay, 3).end;
  const savings = projectSavings(ctx.history, ctx.projection, until, ctx.startDay);
  // Próximos ciclos con la media (para la tabla de meses).
  const months: { cycle: ReturnType<typeof cycleFor>; saving: number; balance: number | null }[] = [];
  let balance = ctx.projection.projectedEndBalance;
  for (let i = 1; i <= 6; i++) {
    const c = cycleFor(ctx.today, ctx.startDay, i);
    if (balance !== null) balance = Math.round((balance + savings.monthlyAverage) * 100) / 100;
    months.push({ cycle: c, saving: savings.monthlyAverage, balance });
  }
  return {
    projection: ctx.projection,
    current: ctx.current,
    afford: opts.amount && opts.amount > 0 ? affordability(ctx.projection, opts.amount) : null,
    savings,
    months,
    recurring: ctx.recurring.filter((r) => r.active),
  };
}

/** Presupuesto: objetivo, límites, gastos fijos y suscripciones (activos y cancelados). */
export async function budgetView(userId: string) {
  const ctx = await financeContext(userId);
  const avg = (cat: string) => {
    const h = ctx.history.slice(0, 3);
    return h.length ? Math.round((h.reduce((s, x) => s + (x.byCategory.find((c) => c.category === cat)?.amount ?? 0), 0) / h.length) * 100) / 100 : null;
  };
  return {
    settings: ctx.settings,
    current: ctx.current,
    projection: ctx.projection,
    budgets: ctx.budgetsNow,
    recurring: ctx.recurring.map((r) => ({ ...r, cancelled: ctx.cancelled.has(r.key) })),
    categoryAverages: Object.fromEntries([...new Set(ctx.history.flatMap((h) => h.byCategory.map((c) => c.category)))].map((c) => [c, avg(c)])),
  };
}

export async function accountsView(userId: string) {
  const [accounts, conns, settings] = await Promise.all([
    getAccounts(userId),
    prisma.personal_bank_connections.findMany({ where: { user_id: userId }, orderBy: { created_at: "asc" } }),
    getSettings(userId),
  ]);
  const counts = await prisma.finance_transactions.groupBy({ by: ["account_id"], where: { user_id: userId }, _count: { _all: true }, _min: { booking_date: true } });
  const byAcc = new Map(counts.map((c) => [c.account_id, { count: c._count._all, since: c._min.booking_date?.toISOString().slice(0, 10) ?? null }]));
  return {
    configured: isBankingConfigured(),
    lastSyncAt: settings.lastSyncAt,
    banks: PERSONAL_BANKS.map((bank) => {
      const c = conns.find((x) => x.bank === bank);
      return {
        bank,
        label: BANK_LABELS[bank],
        connected: !!c,
        expired: c ? c.consent_expires_at.getTime() <= Date.now() : false,
        expiresAt: c?.consent_expires_at.toISOString() ?? null,
        daysLeft: c ? Math.ceil((c.consent_expires_at.getTime() - Date.now()) / 86_400_000) : null,
      };
    }),
    accounts: accounts.map(({ ibanHash: _h, ...a }) => ({ ...a, ...(byAcc.get(a.id) ?? { count: 0, since: null }) })),
  };
}

/** Para el copiloto: movimientos que encajan con una búsqueda, con su total. */
export function searchTxs(ctx: FinanceContext, opts: { text?: string; category?: string; kind?: string; from?: string; to?: string; limit?: number }) {
  const q = opts.text ? normalize(opts.text) : "";
  const rows = ctx.txs.filter((t: Tx) =>
    (!q || normalize(`${t.description} ${t.counterparty ?? ""}`).includes(q) || merchantKey(t.description, t.counterparty).includes(q)) &&
    (!opts.category || t.category === opts.category) &&
    (!opts.kind || t.kind === opts.kind) &&
    (!opts.from || t.date >= opts.from) &&
    (!opts.to || t.date <= opts.to));
  const total = Math.round(rows.reduce((s, t) => s + t.amount, 0) * 100) / 100;
  return {
    count: rows.length,
    total,
    spanDays: rows.length ? daysBetween(rows[rows.length - 1].date, rows[0].date) + 1 : 0,
    items: rows.slice(0, Math.min(opts.limit ?? 40, 100)).map((t) => ({ date: t.date, amount: t.amount, description: t.description, counterparty: t.counterparty, category: t.category, kind: t.kind, extraordinary: t.extraordinary })),
  };
}
