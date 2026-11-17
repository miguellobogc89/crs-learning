// lib/finance/service.ts
// Lo que piden las pantallas y el copiloto: todo calculado con logic.ts sobre los datos guardados.
import "server-only";
import { prisma } from "@/lib/prisma";
import { isBankingConfigured, BANK_LABELS, PERSONAL_BANKS } from "@/lib/personal-finance/enable-banking";
import {
  affordability, budgetStatus, cycleFor, daysBetween, detectAlerts, detectRecurring, liquiditySeries, merchantKey,
  normalize, paydaysFrom, projectCycle, projectSavings, resolvePeriod, summarize, todayIso,
  type Alert, type CycleRule, type CycleSummary, type Tx, type ViewPref,
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
  // El ciclo empieza el día real en que entra la nómina (o el día fijado, adelantado si es festivo).
  const startDay: CycleRule = { day: settings.cycleStartDay, adjust: true, paydays: paydaysFrom(txs, settings.cycleStartDay) };
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
    period: periodSnapshot(ctx),
  };
}

/** Cuentas en EUR que se pueden mostrar u ocultar en pantalla (las excluidas de los totales no salen). */
function visibleAccounts(ctx: FinanceContext, view: ViewPref) {
  const hidden = new Set(view.hiddenAccounts);
  return ctx.accounts.filter((a) => a.included).map((a) => ({
    id: a.id, name: a.name, bank: a.bank, last4: a.ibanLast4, currency: a.currency, balance: a.balance, hidden: hidden.has(a.id),
  }));
}

/** La foto del periodo elegido: totales, comparación con el periodo anterior, evolución y categorías. */
export function periodSnapshot(ctx: FinanceContext) {
  const view = ctx.settings.view;
  const accounts = visibleAccounts(ctx, view);
  const shown = new Set(accounts.filter((a) => !a.hidden).map((a) => a.id));
  const txs = ctx.txs.filter((t) => shown.has(t.accountId));
  const oldest = ctx.txs.length ? ctx.txs[ctx.txs.length - 1].date : null;
  const period = resolvePeriod(view, ctx.today, ctx.startDay, oldest);
  const rule: CycleRule = view.unit === "mes" ? 1 : ctx.startDay;
  const recurringKeys = new Set(ctx.recurring.filter((r) => r.active).map((r) => r.key));
  const totals = summarize(txs, { start: period.from, end: period.to, label: period.label }, recurringKeys);
  // Periodo anterior del mismo tamaño (mismo número de ciclos o meses), si hay datos.
  const n = period.buckets.length;
  const prevFirst = cycleFor(period.buckets[0].start, rule, -n);
  const prevLast = cycleFor(period.buckets[0].start, rule, -1);
  const previous = oldest && prevLast.end >= oldest && view.range !== "todo"
    ? summarize(txs, { start: prevFirst.start, end: prevLast.end, label: "" }, recurringKeys)
    : null;
  // Evolución: los tramos del periodo; si son pocos, los 6 últimos hasta el final del periodo.
  const last = period.buckets[n - 1];
  const trendBuckets = n >= 3 ? period.buckets : Array.from({ length: 6 }, (_, i) => cycleFor(last.start, rule, i - 5));
  const trend = trendBuckets
    .filter((c) => !oldest || c.end >= oldest)
    .map((c) => {
      const x = summarize(txs, c, recurringKeys);
      return { start: c.start, end: c.end, label: c.label, income: x.income + x.gifts, expenses: x.expenses, net: x.net, saved: x.savedToInvestments, current: c.start === last.start };
    });
  const prevCats = new Map((previous?.byCategory ?? []).map((c) => [c.category, c.amount]));
  const balance = accounts.filter((a) => !a.hidden && a.currency === "EUR" && a.balance !== null).reduce((s, a) => s + (a.balance ?? 0), 0);
  return {
    view,
    label: period.label,
    unit: period.unit,
    from: period.from,
    to: period.to,
    buckets: n,
    currentCycle: cycleFor(ctx.today, ctx.startDay),
    accounts,
    balance: Math.round(balance * 100) / 100,
    totals: {
      income: totals.income, gifts: totals.gifts, expenses: totals.expenses, net: totals.net, savingsRate: totals.savingsRate,
      saved: totals.savedToInvestments, fixed: totals.fixedExpenses, variable: totals.variableExpenses, extraordinary: totals.extraordinaryExpenses,
      count: totals.count, perBucketExpenses: Math.round((totals.expenses / n) * 100) / 100,
    },
    previous: previous ? { income: previous.income + previous.gifts, expenses: previous.expenses, net: previous.net } : null,
    trend,
    categories: totals.byCategory.map((c) => ({ ...c, previous: prevCats.get(c.category) ?? null })),
  };
}

/** Movimientos del periodo guardado (o de todo, si se pide), de las cuentas visibles. Filtra y agrupa la pantalla. */
export async function listTransactions(userId: string, opts: { all?: boolean } = {}) {
  const ctx = await financeContext(userId);
  const all = await loadTxs(userId, { includeExcluded: true });
  const view = ctx.settings.view;
  const accounts = ctx.accounts.map((a) => ({ id: a.id, name: a.name, bank: a.bank, last4: a.ibanLast4, included: a.included, hidden: view.hiddenAccounts.includes(a.id) }));
  const accById = new Map(accounts.map((a) => [a.id, a]));
  const notes = new Map((await prisma.finance_transactions.findMany({ where: { user_id: userId, note: { not: null } }, select: { id: true, note: true } })).map((n) => [n.id, n.note]));
  const oldest = all.length ? all[all.length - 1].date : null;
  const period = resolvePeriod(view, ctx.today, ctx.startDay, oldest);
  const rule: CycleRule = view.unit === "mes" ? 1 : ctx.startDay;
  const rows = all.filter((t) => !accById.get(t.accountId)?.hidden && (opts.all || (t.date >= period.from && t.date <= period.to)));
  // Tramo (ciclo o mes) de cada fecha, calculado una vez por fecha distinta.
  const bucketOf = new Map<string, string>();
  const bucketLabels: Record<string, string> = {};
  for (const t of rows) {
    if (bucketOf.has(t.date)) continue;
    const c = cycleFor(t.date, rule);
    bucketOf.set(t.date, c.start);
    bucketLabels[c.start] = c.label;
  }
  return {
    label: opts.all ? "Todo el historial" : period.label,
    from: period.from,
    to: period.to,
    unit: view.unit,
    view,
    accounts,
    count: rows.length,
    bucketLabels,
    items: rows.slice(0, 5000).map((t) => {
      const acc = accById.get(t.accountId);
      return {
        ...t,
        account: acc?.name ?? "—",
        bank: acc?.bank ?? null,
        excluded: acc?.included === false,
        note: notes.get(t.id) ?? null,
        // Tramo (ciclo o mes) al que pertenece, para agrupar en pantalla.
        bucket: bucketOf.get(t.date) ?? t.date,
      };
    }),
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
