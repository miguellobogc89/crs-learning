// lib/finance/service.ts
// Lo que piden las pantallas y el copiloto: todo calculado con logic.ts sobre los datos guardados.
import "server-only";
import { prisma } from "@/lib/prisma";
import { isBankingConfigured, BANK_LABELS, PERSONAL_BANKS } from "@/lib/personal-finance/enable-banking";
import {
  addDays, affordability, cashflowPeriods, cycleFor, daysBetween, detectAlerts, detectRecurring, forecastCashflow, forecastCycleWeeks, insuranceForecastCandidates, isForecastOverride, liquiditySeries, merchantKey, personKey, personName, personTokens, samePerson, round2, median,
  expenseHistoryByCycle, normalize, paydaysFrom, projectCycle, projectSavings, resolvePeriod, summarize, todayIso,
  type Alert, type CycleRule, type CycleSummary, type ForecastItem, type Tx,
} from "./logic";
import { getAccounts, getBudgets, getDismissed, getForecastItems, getSettings, getWishlist, loadTxs } from "./store";
import { budgetMovements, budgetWeeks, conceptKey, detectIncome, detectIncomeAccount, detectedFixedMonthly, planBalance, planBudgetStatus, goalStatus, isPackageCharge, subKey, type GroupCycleTotals, planInsights, packageOwners, packageSpend, transferPlan, unclassifiedFor, wishStatus } from "./plan";
import { AUTO_SYNC_HOURS } from "./sync";
import { domainsFor } from "./logos";
import { zombies } from "./gmail";

const HISTORY_CYCLES = 12;

/** Contexto común: datos y cálculos base de una persona (una sola lectura de la base de datos). */
export async function financeContext(userId: string) {
  const [settings, accounts, txs, budgets, { dismissed, cancelled, skippedOccurrences, recurringOn, recurringOff }, forecastItems] = await Promise.all([
    getSettings(userId),
    getAccounts(userId),
    loadTxs(userId),
    getBudgets(userId),
    getDismissed(userId),
    getForecastItems(userId),
  ]);
  const today = todayIso();
  // El ciclo empieza el día real en que entra la nómina (o el día fijado, adelantado si es festivo).
  const startDay: CycleRule = { day: settings.cycleStartDay, adjust: true, paydays: paydaysFrom(txs, settings.cycleStartDay) };
  const recurring = detectRecurring(txs, today, cancelled, { on: recurringOn, off: recurringOff });
  const recurringKeys = new Set(recurring.filter((r) => r.active).map((r) => r.key));
  const history: CycleSummary[] = [];
  for (let o = 1; o <= HISTORY_CYCLES; o++) history.push(summarize(txs, cycleFor(today, startDay, -o), recurringKeys));
  const oldest = txs.length ? txs[txs.length - 1].date : today;
  const historyWithData = history.filter((h) => h.cycle.end >= oldest);
  const current = summarize(txs, cycleFor(today, startDay), recurringKeys);
  const included = accounts.filter((a) => a.included);
  const eur = included.filter((a) => a.currency === "EUR" && a.balance !== null);
  const liquidity = eur.length ? Math.round(eur.reduce((s, a) => s + (a.balance ?? 0), 0) * 100) / 100 : null;
  const savingsGoalCycle = settings.savingsGoal === null ? null : round2(settings.savingsGoal * (settings.savingsFrequency === "semanal" ? 52 / 12 : 1));
  const projection = projectCycle({ txs, today, startDay, liquidity, recurring, savingsGoal: savingsGoalCycle, history: historyWithData });
  const budgetsNow = planBudgetStatus(budgets, txs, current.cycle, today);
  return { userId, settings, accounts, txs, budgets, budgetsNow, dismissed, cancelled, recurringOn, recurringOff, skippedOccurrences, forecastItems, today, startDay, recurring, history: historyWithData, current, liquidity, projection };
}
export type FinanceContext = Awaited<ReturnType<typeof financeContext>>;

type ForecastSuggestion = { key: string; title: string; detail: string; kind: "ingreso" | "gasto"; amount: number; startDate: string };
type PayslipEvidence = { period_year: number; period_month: number; net_amount: unknown; extra_pay: unknown; salary_advances: unknown };
const monthName = (month: number) => new Intl.DateTimeFormat("es-ES", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2026, month - 1, 1)));
const extraTitle = (year: number, month: number) => `Paga extra · ${monthName(month)} ${year}`;

async function payslipEvidence(userId: string) {
  return prisma.$queryRaw<PayslipEvidence[]>`
    SELECT period_year, period_month, net_amount, extra_pay, salary_advances
    FROM public.finance_payslips WHERE user_id = ${userId}::uuid
    ORDER BY period_year DESC, period_month DESC LIMIT 48
  `;
}

function extraEstimate(payroll: PayslipEvidence[], p: PayslipEvidence) {
  const regular = payroll.filter((r) => r.period_year === p.period_year && r.period_month !== p.period_month
    && Number(r.extra_pay) < 100 && Number(r.salary_advances) === 0).map((r) => Number(r.net_amount));
  return { medianNet: regular.length >= 2 ? median(regular) : null, regularCount: regular.length,
    amount: regular.length >= 2 ? round2(Math.max(0, Number(p.net_amount) - median(regular))) : null };
}

/** Hipótesis anuales, nunca ingresos ni gastos confirmados hasta que el usuario las acepte. */
async function forecastSuggestions(ctx: FinanceContext): Promise<ForecastSuggestion[]> {
  const end = cycleFor(ctx.today, ctx.startDay, 11).end;
  const result: ForecastSuggestion[] = [];
  const payroll = await payslipEvidence(ctx.userId);
  for (const p of payroll) {
    if (Number(p.extra_pay) < 500) continue;
    const year = p.period_year + 1;
    const month = String(p.period_month).padStart(2, "0");
    const startDate = cycleFor(`${year}-${month}-27`, ctx.startDay).start;
    if (startDate < ctx.today || startDate > end) continue;
    const { amount } = extraEstimate(payroll, p);
    if (amount === null || amount < 100) continue;
    result.push({ key: `forecast-extra:${year}-${month}`, title: extraTitle(year, p.period_month), kind: "ingreso", amount, startDate,
      detail: `Tu nómina de ${p.period_month}/${p.period_year} incluyó una paga extra. Se propone la diferencia neta frente a tus nóminas habituales.` });
  }
  for (const candidate of insuranceForecastCandidates(ctx.txs, ctx.today, end)) {
    const { key, title, amount, startDate, cadence, evidence, sourceTx } = candidate;
    if (ctx.recurring.some((r) => r.active && r.key === merchantKey(sourceTx.description, sourceTx.counterparty))) continue;
    result.push({ key, title, kind: "gasto", amount, startDate,
      detail: evidence > 1 ? `Estimado a partir de ${evidence} recibos; posible renovación ${cadence}.`
        : "Solo hay un recibo de referencia. Comprueba si se renueva cada año." });
  }
  return result.filter((s) => !ctx.dismissed.has(s.key) && !ctx.forecastItems.some((item) => item.sourceKey === s.key));
}

/** Justificación verificable de una sugerencia, con fuentes exclusivamente del usuario autenticado. */
export async function forecastSource(userId: string, key: string) {
  const extra = /^forecast-extra:(20\d{2})-(0[1-9]|1[0-2])$/.exec(key);
  if (extra) {
    const year = Number(extra[1]);
    const month = Number(extra[2]);
    const payroll = await payslipEvidence(userId);
    const source = payroll.find((p) => p.period_year === year - 1 && p.period_month === month && Number(p.extra_pay) >= 500);
    if (!source) return null;
    const estimate = extraEstimate(payroll, source);
    return { title: extraTitle(year, month), kind: "ingreso" as const,
      estimate: estimate.amount, targetDate: `${year}-${extra[2]}-25`,
      explanation: "Se ha comparado el neto de esa nómina con la mediana de tus nóminas normales del mismo año, sin paga extra ni adelantos.",
      caution: Number(source.salary_advances) > 0 ? "Esta nómina contiene adelantos; la diferencia neta puede no representar exactamente el importe de la paga extra." : "Es una estimación basada en el año anterior, no un cobro confirmado por la empresa.",
      source: { type: "payslip" as const, date: `${source.period_year}-${String(source.period_month).padStart(2, "0")}`,
        label: `Nómina de ${monthName(month)} ${source.period_year}`, description: "Paga extraordinaria reflejada en tu nómina", amount: Number(source.net_amount) },
      breakdown: [{ label: "Neto de aquella nómina", value: Number(source.net_amount) },
        { label: "Paga extra bruta en la nómina", value: Number(source.extra_pay) },
        { label: "Neto habitual (mediana)", value: estimate.medianNet },
        { label: "Adelantos en esa nómina", value: Number(source.salary_advances) },
        { label: "Nóminas habituales comparadas", value: estimate.regularCount, format: "count" }] };
  }
  if (!/^forecast-insurance:[a-z0-9-]+:\d{4}-\d{2}$/.test(key)) return null;
  const ctx = await financeContext(userId);
  const candidate = insuranceForecastCandidates(ctx.txs, ctx.today, cycleFor(ctx.today, ctx.startDay, 11).end)
    .find((c) => c.key === key);
  if (!candidate) return null;
  const tx = candidate.sourceTx;
  const account = ctx.accounts.find((a) => a.id === tx.accountId);
  return { title: candidate.title, kind: "gasto" as const, estimate: candidate.amount, targetDate: candidate.startDate,
    explanation: candidate.evidence > 1
      ? `Detectamos ${candidate.evidence} cargos compatibles. La siguiente fecha se calcula con periodicidad ${candidate.cadence}.`
      : "Solo encontramos este cargo. Hemos supuesto una renovación anual, pero no está verificada.",
    caution: "El importe y la fecha son orientativos. Comprueba tu póliza antes de incluirlos.",
    source: { type: "transaction" as const, date: tx.date, label: tx.counterparty || "Movimiento bancario",
      description: tx.description, amount: tx.amount, account: account ? `${account.bank} · ${account.name}` : null },
    related: candidate.supportingTxs.slice(0, 3).map((t) => ({ date: t.date, description: t.description, amount: t.amount })),
    breakdown: [{ label: "Recibos compatibles encontrados", value: candidate.evidence, format: "count" }] };
}

/** Suscripciones zombi (Gmail): te cobran después de un correo de cancelación. */
async function zombieAlerts(userId: string): Promise<Alert[]> {
  const list = await zombies(userId).catch(() => []);
  const day = (d: string) => d.split("-").reverse().join("/");
  return list.map((z) => {
    const name = z.merchant.charAt(0).toUpperCase() + z.merchant.slice(1);
    const total = z.charges.reduce((s, c) => s - c.amount, 0);
    const last = z.charges[z.charges.length - 1];
    return {
      key: `zombi:${z.messageId}:${z.charges.map((c) => c.id).join(",").slice(0, 120)}`,
      level: "importante" as const,
      title: `${name}: te siguen cobrando después de cancelar`,
      body: `Recibiste la cancelación el ${day(z.cancelledOn)} («${z.subject.slice(0, 80)}»), pero después hay ${z.charges.length} ${z.charges.length === 1 ? "cargo" : "cargos"} por ${total.toFixed(2).replace(".", ",")} € (el último, el ${day(last.date)}). Reclámalo.`,
      txIds: z.charges.map((c) => c.id),
    };
  });
}

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

/** Inicio: el ciclo, la previsión, categorías, evolución, presupuestos y avisos. `offset` -1 = ciclo anterior. */
export async function overview(userId: string, offset = 0) {
  const ctx = await financeContext(userId);
  const { txs, today, recurring, history, current, projection, budgetsNow, accounts, settings } = ctx;
  const [zombie, connection, suggestions] = await Promise.all([zombieAlerts(userId), connectionAlerts(userId), forecastSuggestions(ctx)]);
  const alerts = [...zombie, ...connection, ...detectAlerts({ txs, today, recurring, history, current, budgets: budgetsNow })]
    .filter((a) => !ctx.dismissed.has(a.key));
  const prev = history[0] ?? null;
  const cycleDates = [...history].reverse().map((h) => h.cycle.end).concat(today);
  const pendingReview = txs.filter((t) => t.source === "auto" || t.source === "pendiente").length;
  const pendingClassify = txs.filter((t) => t.source === "pendiente").length;
  const syncDue = !settings.lastSyncAt || Date.now() - new Date(settings.lastSyncAt).getTime() > AUTO_SYNC_HOURS * 3_600_000;
  const includedAccountIds = new Set(accounts.filter((account) => account.included).map((account) => account.id));
  const balanceAccountIds = new Set(accounts.filter((account) => account.included && account.currency === "EUR" && account.balance !== null).map((account) => account.id));
  const cashflow = cashflowPeriods(txs, today);
  const futureCashflow = forecastCashflow({ txs, today, startDay: ctx.startDay, recurring, history, current, projection, liquidity: ctx.liquidity, items: ctx.forecastItems, skippedOccurrences: ctx.skippedOccurrences });
  // Cinco tramos semanales, incluyendo el inicio del ciclo siguiente cuando
  // el primero dura solo cuatro semanas (p. ej. febrero).
  const nextWeeks = futureCashflow.points.slice(1, 3).flatMap((point) => forecastCycleWeeks({
    point, recurring, items: ctx.forecastItems, today, skippedOccurrences: ctx.skippedOccurrences,
  })).slice(0, 5);
  for (const range of ["7D", "1M", "6M", "1A"] as const) {
    for (const point of cashflow[range].points) {
      if (ctx.liquidity === null) continue;
      const later = txs.filter((t) => balanceAccountIds.has(t.accountId) && t.date > point.end).reduce((sum, t) => sum + t.amount, 0);
      point.available = round2(ctx.liquidity - later);
    }
  }
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
    cashflow,
    forecastCashflow: futureCashflow,
    forecastNextWeeks: nextWeeks,
    forecastItems: ctx.forecastItems.filter((item) => !isForecastOverride(item)),
    forecastSuggestions: suggestions,
    categoryHistory: expenseHistoryByCycle(txs, ctx.startDay),
    recentExpenses: txs
      .filter((tx) => tx.kind === "gasto" && tx.amount < 0 && includedAccountIds.has(tx.accountId))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5)
      .map(({ id, date, amount, description, counterparty, alias, category, subcategory }) => ({ id, date, amount, description, counterparty, alias, category, subcategory })),
    liquiditySeries: liquiditySeries(accounts.filter((a) => a.included), txs, cycleDates),
    projection,
    budgets: budgetsNow,
    alerts: alerts.slice(0, 12),
    pendingReview,
    pendingClassify,
    upcoming: projection.pending.slice(0, 8),
    cycleView: cycleSnapshot(ctx, Math.min(0, Math.max(-36, Math.trunc(offset) || 0))),
  };
}

/**
 * Inicio: un ciclo (el actual por defecto) con sus cifras, la comparación con el ciclo anterior a la misma altura
 * (a mitad de ciclo, comparar con un ciclo entero engaña), la evolución diaria del saldo y, en el actual, lo que
 * queda disponible y el saldo previsto al final.
 */
export function cycleSnapshot(ctx: FinanceContext, offset: number) {
  const { txs, today, startDay } = ctx;
  const cycle = cycleFor(today, startDay, offset);
  const prevCycle = cycleFor(cycle.start, startDay, -1);
  const isCurrent = offset === 0;
  const recurringKeys = new Set(ctx.recurring.filter((r) => r.active).map((r) => r.key));
  const totalDays = daysBetween(cycle.start, cycle.end) + 1;
  const elapsed = isCurrent ? Math.min(totalDays, daysBetween(cycle.start, today) + 1) : totalDays;
  const cur = summarize(txs, cycle, recurringKeys);
  const prevEnd = isCurrent ? addDays(prevCycle.start, elapsed - 1) : prevCycle.end;
  const oldest = txs.length ? txs[txs.length - 1].date : null;
  const hasPrev = !!oldest && oldest <= prevCycle.start;
  const prev = hasPrev ? summarize(txs, { start: prevCycle.start, end: prevEnd < prevCycle.end ? prevEnd : prevCycle.end, label: prevCycle.label }, recurringKeys) : null;
  // Saldo de cada día del ciclo (hacia atrás desde el saldo de hoy de las cuentas incluidas).
  const lastDay = isCurrent ? today : cycle.end;
  const dates: string[] = [];
  for (let d = cycle.start; d <= lastDay && dates.length < 40; d = addDays(d, 1)) dates.push(d);
  const included = ctx.accounts.filter((a) => a.included);
  const series = liquiditySeries(included, txs, dates);
  const p = ctx.projection;
  const banks = [...new Set(included.filter((a) => a.balance !== null).map((a) => a.bank).filter((b): b is string => !!b))];
  return {
    offset,
    isCurrent,
    cycle,
    previousLabel: prevCycle.label,
    day: elapsed,
    totalDays,
    daysLeft: isCurrent ? p.daysLeft : 0,
    canGoBack: !!oldest && oldest < cycle.start,
    balance: isCurrent ? ctx.liquidity : series.length ? series[series.length - 1].balance : null,
    banks: banks.map((b) => BANK_LABELS[b as keyof typeof BANK_LABELS] ?? b),
    // Lo que queda para gastar hasta fin de ciclo: saldo + cobros previstos − recibos pendientes.
    available: isCurrent && ctx.liquidity !== null ? Math.round((ctx.liquidity + p.pendingIncome - p.pendingFixed) * 100) / 100 : null,
    pendingFixed: isCurrent ? p.pendingFixed : 0,
    pendingIncome: isCurrent ? p.pendingIncome : 0,
    projectedEnd: isCurrent ? p.projectedEndBalance : null,
    totals: { income: cur.income + cur.gifts, gifts: cur.gifts, expenses: cur.expenses, net: cur.net, saved: cur.savedToInvestments, fixed: cur.fixedExpenses, variable: cur.variableExpenses, extraordinary: cur.extraordinaryExpenses, count: cur.count },
    previous: prev ? { income: prev.income + prev.gifts, expenses: prev.expenses, net: prev.net, partial: isCurrent } : null,
    categories: cur.byCategory,
    previousCategories: prev?.byCategory ?? [],
    series,
    accounts: included.map((a) => ({ id: a.id, name: a.name, bank: a.bank, last4: a.ibanLast4, balance: a.balance, currency: a.currency })),
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
  // Logo de cada comercio conocido (su web), si ya se ha resuelto.
  // Un pago rechazado (0 €) trae como contraparte al propio titular: su comercio sale del concepto.
  const merchantOf = (t: (typeof rows)[number]) => (Math.abs(t.amount) < 0.005 ? merchantKey(t.description, null) : merchantKey(t.description, t.counterparty));
  const logos = await domainsFor(rows.map(merchantOf));
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
    /** Gastos previstos sin cumplir: arriba de la lista, en azul. */
    planned: plannedOf(ctx.forecastItems),
    items: rows.slice(0, 5000).map((t) => {
      const acc = accById.get(t.accountId);
      return {
        ...t,
        account: acc?.name ?? "—",
        bank: acc?.bank ?? null,
        accountLast4: acc?.last4 ?? null,
        excluded: acc?.included === false,
        note: notes.get(t.id) ?? null,
        // Tramo (ciclo o mes) al que pertenece, para agrupar en pantalla.
        bucket: bucketOf.get(t.date) ?? t.date,
        // Mes (de nómina) del cargo y, si se cambió la fecha, el mes en que cuenta: lo que enseña «Cambiar fecha».
        cycleStart: cycleFor(t.date, ctx.startDay).start,
        // Pago rechazado: el banco lo deja a 0 €. Solo se ve en Movimientos, tachado; no cuenta en ningún sitio.
        declined: Math.abs(t.amount) < 0.005,
        logo: t.kind === "interna" && Math.abs(t.amount) >= 0.005 ? null : logos.get(merchantOf(t)) ?? null,
        imputedCycle: t.imputedDate ? cycleFor(t.imputedDate, ctx.startDay).start : null,
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
  // Cuenta que paga cada recibo: la del último cargo de ese comercio.
  const lastAccount = new Map<string, string>();
  for (const t of ctx.txs) {
    if (t.amount >= 0) continue;
    const k = merchantKey(t.description, t.counterparty);
    if (!lastAccount.has(k)) lastAccount.set(k, t.accountId);
  }
  const recurring = ctx.recurring.map((r) => ({ ...r, cancelled: ctx.cancelled.has(r.key), accountId: lastAccount.get(r.key) ?? null,
    monthly: round2(Math.abs(r.amount) * (30 / r.intervalDays)) }));
  const cycle = ctx.current.cycle;
  const { settings } = ctx;
  const savingsGoalCycle = ctx.projection.savingsGoal;
  const detectedIncome = detectIncome(ctx.history);
  const detectedIncomeAccount = detectIncomeAccount(ctx.txs, cycleFor(ctx.today, ctx.startDay, -3).start);
  const incomeAccountId = settings.incomeAccountId ?? detectedIncomeAccount;
  const wishlist = await getWishlist(userId);
  const accounts = ctx.accounts.filter((a) => a.included).map((a) => ({ id: a.id, name: a.name, bank: a.bank, last4: a.ibanLast4, balance: a.balance }));
  const plan = {
    cycle,
    today: ctx.today,
    balance: planBalance({ expectedIncome: settings.expectedIncome, detectedIncome, savingsGoal: savingsGoalCycle, budgets: ctx.budgets, detectedFixed: detectedFixedMonthly(recurring) }),
    detectedIncome,
    incomeAccountId,
    incomeAccountDetected: settings.incomeAccountId === null,
    savingsAccountId: settings.savingsAccountId,
    transfers: transferPlan({ budgets: ctx.budgets, savingsGoal: savingsGoalCycle, savingsAccountId: settings.savingsAccountId, incomeAccountId, txs: ctx.txs, cycle }),
    weeks: Object.fromEntries(ctx.budgets.filter((b) => b.kind !== "fijo").map((b) => [b.id, budgetWeeks(b, ctx.txs, cycle, ctx.today)])),
    movements: Object.fromEntries(ctx.budgets.map((b) => [b.id, budgetMovements(b, ctx.txs, cycle)])),
    unclassified: Object.fromEntries(ctx.budgets.filter((b) => b.accountId).map((b) => [b.id, unclassifiedFor(b.accountId!, ctx.txs, cycle)])),
    accounts,
  };
  return {
    settings: ctx.settings,
    current: ctx.current,
    projection: ctx.projection,
    budgets: ctx.budgetsNow,
    plan,
    wishlist: wishlist.map((w) => wishStatus(w, ctx.projection.safeToSpend)),
    recurring,
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

/**
 * Mi plan: los paquetes del usuario con lo que llevan este ciclo, el ciclo anterior y la media de los 3 anteriores,
 * y los cargos del último año para elegir los que entran en cada uno (cada cargo solo en un paquete).
 */
export async function packagesView(userId: string) {
  const [ctx, rows] = await Promise.all([
    financeContext(userId),
    prisma.finance_packages.findMany({ where: { user_id: userId }, orderBy: { created_at: "asc" } }),
  ]);
  const toCharge = (t: (typeof ctx.txs)[number]) => ({
    id: t.id, date: t.date, amount: t.amount, accountId: t.accountId, category: t.category,
    concept: conceptKey(t.description, t.counterparty),
    description: t.alias || t.counterparty || t.description, detail: t.description,
  });
  // Solo el consumo cuenta en los paquetes; las aportaciones a ahorro o inversión se ven en el modal, bloqueadas.
  const all = ctx.txs.filter(isPackageCharge).map(toCharge);
  const savingsMoves = ctx.txs.filter((t) => t.kind === "ahorro" && t.amount < 0).map(toCharge);
  const packs = rows.map((p) => ({ id: p.id, name: p.name, conceptKeys: p.concept_keys, txIds: p.tx_ids, goal: p.goal === null ? null : Number(p.goal) }));
  const owner = packageOwners(packs, all);
  const current = cycleFor(ctx.today, ctx.startDay);
  const oldest = ctx.txs.length ? ctx.txs[ctx.txs.length - 1].date : ctx.today;
  const previous = [1, 2, 3].map((o) => cycleFor(ctx.today, ctx.startDay, -o)).filter((c) => c.start >= oldest);
  const since = addDays(ctx.today, -365);
  const day = daysBetween(current.start, ctx.today) + 1;
  const totalDays = daysBetween(current.start, current.end) + 1;
  // Ingreso medio de los mismos ciclos completos que la media de los paquetes (del histórico, no se configura).
  const incomes = ctx.history.filter((h) => previous.some((c) => c.start === h.cycle.start)).map((h) => h.income);
  const charges = [
    ...all.filter((c) => c.date >= since).map((c) => ({ ...c, owner: owner.get(c.id) ?? null, patrimonial: false })),
    ...savingsMoves.filter((c) => c.date >= since).map((c) => ({ ...c, owner: null, patrimonial: true })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  return {
    cycle: { ...current, day, totalDays },
    averageCycles: previous.length,
    /** Ciclos del último par de años (el actual primero), para agrupar historiales por ciclo. */
    cycles: Array.from({ length: 24 }, (_, i) => cycleFor(ctx.today, ctx.startDay, -i)).filter((c) => c.end >= oldest),
    /** Ciclos de la media, para que el modal proponga el objetivo con lo que se va marcando. */
    averageRanges: previous.map(({ start, end }) => ({ start, end })),
    averageIncome: incomes.length ? round2(incomes.reduce((a, b) => a + b, 0) / incomes.length) : null,
    /** Objetivo de ahorro de Finanzas (el mismo que usa la previsión); perCycle con la misma conversión semanal → ciclo. */
    savings: { amount: ctx.settings.savingsGoal, frequency: ctx.settings.savingsFrequency, perCycle: ctx.projection.savingsGoal },
    packages: packs.map((p) => {
      const prev = previous.map((c) => packageSpend(p.id, owner, all, c));
      const spent = packageSpend(p.id, owner, all, current);
      return {
        ...p,
        progress: goalStatus(spent, p.goal, day, totalDays),
        count: charges.filter((c) => c.owner === p.id).length,
        current: spent,
        previous: prev.length ? prev[0] : null,
        average: prev.length ? round2(prev.reduce((a, b) => a + b, 0) / prev.length) : null,
        currentCharges: all.filter((c) => owner.get(c.id) === p.id && c.date >= current.start && c.date <= current.end)
          .map(({ id, date, amount, description, detail }) => ({ id, date, amount, description, detail })),
      };
    }),
    /** Gasto real del ciclo que no está en ningún paquete (≠ «pendiente de presupuestar», que habla de objetivos). */
    unpackaged: (() => {
      const items = all.filter((c) => !owner.has(c.id) && c.date >= current.start && c.date <= current.end)
        .map(({ id, date, amount, description, detail }) => ({ id, date, amount, description, detail }));
      return { total: round2(items.reduce((s, c) => s - c.amount, 0)), count: items.length, items };
    })(),
    insights: planInsights({
      packages: packs.map((p) => {
        const spent = packageSpend(p.id, owner, all, current);
        return { name: p.name, goal: p.goal, current: spent, progress: goalStatus(spent, p.goal, day, totalDays) };
      }),
      unpackaged: (() => {
        const rows = all.filter((c) => !owner.has(c.id) && c.date >= current.start && c.date <= current.end);
        return { total: round2(rows.reduce((s, c) => s - c.amount, 0)), count: rows.length };
      })(),
      saving: { saved: round2(ctx.current.income - ctx.current.expenses), goal: ctx.projection.savingsGoal },
      daysLeft: totalDays - day,
    }),
    /** Ahorro del ciclo hasta hoy: ingresos ordinarios − gasto real (las aportaciones a ahorro no son gasto). */
    cycleSaving: { income: ctx.current.income, expenses: ctx.current.expenses, saved: round2(ctx.current.income - ctx.current.expenses) },
    accounts: ctx.accounts.filter((a) => a.included).map((a) => ({ id: a.id, name: a.name, bank: a.bank, last4: a.ibanLast4 })),
    charges,
  };
}

/** Grupos con los que arranca Plan la primera vez (cada uno solo con categorías; el usuario los cambia). */
// Grupos de inicio para quien aún no tiene ninguno (24/11/2026). Lo demás queda «Sin grupo» en Inicio, a la vista,
// como invitación a agruparlo; el usuario los cambia en Mi plan.
const DEFAULT_PLAN_GROUPS: { name: string; categories: string[]; fixed?: boolean }[] = [
  { name: "Recibos y cuotas", fixed: true, categories: ["vivienda", "comunidad", "seguro_hogar", "seguro_coche", "luz", "gas", "agua", "internet_fijo", "movil", "suministros", "prestamos", "suscripciones"] },
  { name: "Alimentación", categories: ["alimentacion", "comida_domicilio"] },
  { name: "Ocio y caprichos", categories: ["restaurantes", "bares_copas", "conciertos_espectaculos", "hobbies", "videojuegos", "ocio"] },
  { name: "Viajes", categories: ["viajes"] },
];

/**
 * Plan: los grupos del usuario (conjuntos de categorías con objetivo opcional) y, por categoría, el gasto de este
 * ciclo y del ciclo anterior hasta el mismo día del ciclo. Solo gastos reales de cuentas incluidas (sin traspasos
 * ni aportaciones a ahorro). Si aún no tiene grupos y ya hay movimientos, se crean los de inicio.
 */
/** Gastos previstos («Añadir gasto» con fecha) que aún no se han cumplido con un cargo real. */
export type Planned = { id: string; title: string; amount: number; date: string; category: string };
const plannedOf = (items: ForecastItem[]): Planned[] => items
  .filter((i) => i.source === "previsto" && i.kind === "gasto" && i.category && !i.matchedTxId)
  .map((i) => ({ id: i.id, title: i.title, amount: i.amount, date: i.startDate, category: i.category as string }))
  .sort((a, b) => b.date.localeCompare(a.date));

/**
 * Un gasto mensual cae una vez en cada ciclo, el mismo día del mes que su último cargo (el 31 pasa a ser el 30 en
 * noviembre). Así un cargo que un mes se retrasa al día 1 no empuja la previsión al mes siguiente.
 */
function monthlyDateIn(cycle: { start: string; end: string }, lastDate: string) {
  const dom = Number(lastDate.slice(8, 10));
  let [y, m] = cycle.start.slice(0, 7).split("-").map(Number);
  for (let i = 0; i < 2; i++) {
    const len = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const d = `${y}-${String(m).padStart(2, "0")}-${String(Math.min(dom, len)).padStart(2, "0")}`;
    if (d >= cycle.start) return d > cycle.end ? cycle.end : d;
    m += 1; if (m > 12) { m = 1; y += 1; }
  }
  return cycle.end;
}

/**
 * El mes que viene, lo ya comprometido: los gastos que se repiten (sin los cancelados), en las fechas en que tocan,
 * y tus previstos de ese mes. Y los cancelados, aparte (lo que ya no pagarás).
 */
function nextMonthCommitted(ctx: Awaited<ReturnType<typeof financeContext>>) {
  const cycle = cycleFor(ctx.today, ctx.startDay, 1);
  const items: { id: string; title: string; amount: number; date: string; category: string; subcategory: string | null; source: "repite" | "previsto"; txId?: string; key?: string; frequency?: string }[] = [];
  // Último cargo real de cada comercio que se repite: al tocarlo se abre su detalle (donde se cancela).
  const lastTx = new Map<string, string>();
  for (const t of ctx.txs) if (t.amount < 0) { const k = merchantKey(t.description, t.counterparty); if (!lastTx.has(k)) lastTx.set(k, t.id); }
  for (const r of ctx.recurring) {
    if (r.amount >= 0 || !r.active || ctx.cancelled.has(r.key) || r.intervalDays <= 0) continue;
    if (r.frequency === "mensual") {
      const d = monthlyDateIn(cycle, r.lastDate);
      items.push({ id: `rec:${r.key}:${d}`, title: r.label, amount: round2(-r.amount), date: d, category: r.category, subcategory: r.subcategory ?? null, source: "repite", txId: lastTx.get(r.key), key: r.key, frequency: r.frequency });
      continue;
    }
    let d = r.nextDate;
    while (d < cycle.start) d = addDays(d, r.intervalDays);
    for (; d <= cycle.end; d = addDays(d, r.intervalDays)) items.push({ id: `rec:${r.key}:${d}`, title: r.label, amount: round2(-r.amount), date: d, category: r.category, subcategory: r.subcategory ?? null, source: "repite", txId: lastTx.get(r.key), key: r.key, frequency: r.frequency });
  }
  for (const p of plannedOf(ctx.forecastItems)) {
    if (p.date >= cycle.start && p.date <= cycle.end) items.push({ ...p, subcategory: null, source: "previsto" });
  }
  const cancelled = ctx.recurring.filter((r) => r.amount < 0 && ctx.cancelled.has(r.key))
    .map((r) => ({ key: r.key, title: r.label, amount: round2(-r.amount), category: r.category, subcategory: r.subcategory ?? null }));
  return { cycle, items: items.sort((a, b) => a.date.localeCompare(b.date)), cancelled };
}

/**
 * Este mes, lo que se repite y aún no se ha cobrado (24/11/2026): un gasto mensual sin ningún cargo imputado a este
 * ciclo (p. ej. la hipoteca de noviembre si el cargo del día 3 era de octubre), o uno trimestral/anual que toca
 * este ciclo y no ha llegado. Sale como previsto en azul hasta que llega el cargo real, que lo sustituye solo.
 */
/** Palabras que identifican la marca de un comercio (sin «compra», «recibo», ciudades…). */
const BRAND_NOISE = new Set(["compra", "compras", "recibo", "pago", "cargo", "tarjeta", "transferencia", "bizum", "payment", "purchase", "from", "to", "at", "de", "del", "la", "el", "sa", "sl", "s.a.", "s.l.", "ltd", "limited", "inc", "ireland", "dublin", "europe", "spain", "online", "sub", "com", "www"]);
const brandWords = (key: string) => new Set(key.split(" ").map((w) => w.replace(/[^a-z0-9ñ]/g, "")).filter((w) => w.length >= 4 && !BRAND_NOISE.has(w)));

function currentMonthPending(ctx: Awaited<ReturnType<typeof financeContext>>) {
  const cycle = cycleFor(ctx.today, ctx.startDay);
  const charged = new Set<string>();
  const inCycle: { words: Set<string>; amount: number; category: string }[] = [];
  const lastTx = new Map<string, string>();
  for (const t0 of ctx.txs) {
    if (t0.amount >= 0) continue;
    const k = merchantKey(t0.description, t0.counterparty);
    if (!lastTx.has(k)) lastTx.set(k, t0.id);
    const t = spendDated(t0);
    if (t.date >= cycle.start && t.date <= cycle.end) { charged.add(k); inCycle.push({ words: brandWords(k), amount: -t0.amount, category: t0.category }); }
  }
  // Ya cobrado aunque llegue con otro texto o por otra cuenta (la suscripción de Claude pagada con Revolut y no con
  // Santander): mismo comercio (una palabra de marca en común), misma categoría e importe parecido.
  const chargedLike = (r: { key: string; amount: number; category: string }) => {
    const words = brandWords(r.key);
    return inCycle.some((c) => c.category === r.category && Math.abs(c.amount + r.amount) <= Math.max(1, -r.amount * 0.2) && [...words].some((w) => c.words.has(w)));
  };
  const items: { id: string; title: string; amount: number; date: string; category: string; subcategory: string | null; source: "repite"; txId?: string; key: string; frequency?: string }[] = [];
  // Cancelados que este mes ya no se cobrarán (y aún no se habían cobrado): eso es ahorro de este mes. Si ya te lo
  // cobraron este mes, el ahorro empieza el que viene.
  const cancelled: { key: string; title: string; amount: number; category: string; subcategory: string | null }[] = [];
  for (const r of ctx.recurring) {
    if (r.amount >= 0 || r.intervalDays <= 0 || r.frequency === "semanal") continue;
    if (charged.has(r.key) || chargedLike(r)) continue;
    if (r.frequency !== "mensual" && r.nextDate > cycle.end) continue;
    if (ctx.cancelled.has(r.key)) {
      if (daysBetween(r.lastDate, cycle.start) <= r.intervalDays * 1.5 + 3) cancelled.push({ key: r.key, title: r.label, amount: round2(-r.amount), category: r.category, subcategory: r.subcategory ?? null });
      continue;
    }
    if (!r.active) continue;
    const due = r.frequency === "mensual" ? monthlyDateIn(cycle, r.lastDate) : r.nextDate;
    const date = due >= ctx.today && due <= cycle.end ? due : ctx.today;
    items.push({ id: `pend:${r.key}`, title: r.label, amount: round2(-r.amount), date, category: r.category, subcategory: r.subcategory ?? null, source: "repite", txId: lastTx.get(r.key), key: r.key, frequency: r.frequency });
  }
  return { items: items.sort((a, b) => a.date.localeCompare(b.date)), cancelled };
}

/** Para medir el gasto, un movimiento cuenta en su fecha imputada (si la tiene), no en la del cargo. */
const spendDated = <T extends { date: string; imputedDate?: string | null }>(t: T): T => (t.imputedDate ? { ...t, date: t.imputedDate } : t);
/** Para el dinero de cada mes: una deuda cuenta cuando se pagó (su fecha real); lo demás, como el gasto. */
const moneyDated = <T extends { date: string; imputedDate?: string | null; imputedDebt?: boolean }>(t: T): T => (t.imputedDebt ? t : spendDated(t));

export async function planView(userId: string) {
  const ctx = await financeContext(userId);
  const load = () => prisma.finance_plan_groups.findMany({ where: { user_id: userId }, orderBy: [{ position: "asc" }, { created_at: "asc" }] });
  let rows = await load();
  if (!rows.length && ctx.txs.length) {
    await prisma.finance_plan_groups.createMany({ data: DEFAULT_PLAN_GROUPS.map((g, i) => ({ user_id: userId, name: g.name, categories: g.categories, position: i, fixed: g.fixed ?? false })) });
    rows = await load();
  }
  const current = cycleFor(ctx.today, ctx.startDay);
  const day = daysBetween(current.start, ctx.today) + 1;
  const snaps = new Map((await prisma.finance_balance_snapshots.findMany({ where: { user_id: userId }, select: { account_id: true, day: true, balance: true } }))
    .map((s) => [`${s.account_id}|${s.day.toISOString().slice(0, 10)}`, Number(s.balance)]));
  const oldest = ctx.txs.length ? ctx.txs[ctx.txs.length - 1].date : ctx.today;
  const prevCycle = cycleFor(ctx.today, ctx.startDay, -1);
  const prevTo = addDays(prevCycle.start, day - 1) < prevCycle.end ? addDays(prevCycle.start, day - 1) : prevCycle.end;
  const hasPrevious = prevCycle.start >= oldest;
  // Los extraordinarios (lo que no depende de ti: el IBI, una avería, una escapada que quieres ver aparte) no cuentan
  // para el objetivo, la media ni la comparación: se dan aparte (`extrasNow`) en todas las pantallas.
  const now: Record<string, number> = {};
  const before: Record<string, number> = {};
  const extrasNow: Record<string, number> = {};
  for (const t0 of ctx.txs) {
    if (t0.imputedDebt) continue;
    const t = spendDated(t0);
    if (!isPackageCharge(t)) continue;
    if (t.extraordinary) {
      if (t.date >= current.start && t.date <= current.end) extrasNow[t.category] = round2((extrasNow[t.category] ?? 0) - t.amount);
      continue;
    }
    if (t.date >= current.start && t.date <= current.end) now[t.category] = round2((now[t.category] ?? 0) - t.amount);
    if (hasPrevious && t.date >= prevCycle.start && t.date <= prevTo) before[t.category] = round2((before[t.category] ?? 0) - t.amount);
  }
  // Gasto por categoría de los últimos ciclos (el actual primero), entero y hasta el mismo día del ciclo, para el
  // resumen de cada grupo en Inicio. Solo ciclos con datos completos (salvo el actual).
  const history: GroupCycleTotals[] = [];
  for (let i = 0; i < 7; i++) {
    const c = i === 0 ? current : cycleFor(ctx.today, ctx.startDay, -i);
    if (i > 0 && c.start < oldest) break;
    const cut = addDays(c.start, day - 1) < c.end ? addDays(c.start, day - 1) : c.end;
    const full: Record<string, number> = {};
    const atDay: Record<string, number> = {};
    const subAtDay: Record<string, number> = {};
    for (const t0 of ctx.txs) {
      if (t0.imputedDebt) continue;
      const t = spendDated(t0);
      if (!isPackageCharge(t) || t.extraordinary || t.date < c.start || t.date > c.end) continue;
      full[t.category] = round2((full[t.category] ?? 0) - t.amount);
      if (t.date > cut) continue;
      atDay[t.category] = round2((atDay[t.category] ?? 0) - t.amount);
      const k = subKey(t.category, t.subcategory);
      subAtDay[k] = round2((subAtDay[k] ?? 0) - t.amount);
    }
    history.push({ full, atDay, subAtDay });
  }
  // Gasto día a día (sin extraordinarios) de este ciclo y del anterior completo, para el gráfico de Inicio; los
  // extraordinarios de este ciclo van aparte. Y el límite de gasto: lo que entra menos lo que quieres ahorrar.
  const totalDays = daysBetween(current.start, current.end) + 1;
  const prevDays = daysBetween(prevCycle.start, prevCycle.end) + 1;
  const daily: { cur: Record<string, number[]>; prev: Record<string, number[]> } = { cur: {}, prev: {} };
  const extras: { date: string; label: string; amount: number; category: string }[] = [];
  for (const t0 of ctx.txs) {
    if (t0.imputedDebt) continue;
    const t = spendDated(t0);
    if (!isPackageCharge(t)) continue;
    if (t.date >= current.start && t.date <= current.end) {
      if (t.extraordinary) { extras.push({ date: t.date, label: t.alias || t.counterparty || t.description, amount: round2(-t.amount), category: t.category }); continue; }
      const row = (daily.cur[t.category] ??= Array(totalDays).fill(0));
      row[daysBetween(current.start, t.date)] = round2(row[daysBetween(current.start, t.date)] - t.amount);
    } else if (hasPrevious && t.date >= prevCycle.start && t.date <= prevCycle.end && !t.extraordinary) {
      const row = (daily.prev[t.category] ??= Array(prevDays).fill(0));
      row[daysBetween(prevCycle.start, t.date)] = round2(row[daysBetween(prevCycle.start, t.date)] - t.amount);
    }
  }
  // Lo que la app no ha sabido entender (ni reglas, ni palabras, ni IA; no lo que tú pusiste en «Otros gastos»):
  // media al mes de los 3 ciclos cerrados, para avisar antes de crear el plan de ahorro.
  const closed3 = [1, 2, 3].map((i) => cycleFor(ctx.today, ctx.startDay, -i)).filter((c) => c.start >= oldest);
  const unknownSpend = closed3.length ? round2(ctx.txs.filter((t0) => {
    const t = spendDated(t0);
    return isPackageCharge(t) && !t.extraordinary && (t.source === "auto" || t.source === "pendiente") && closed3.some((c) => t.date >= c.start && t.date <= c.end);
  }).reduce((x, t) => x - t.amount, 0) / closed3.length) : 0;
  const unknownCount = ctx.txs.filter((t) => isPackageCharge(t) && (t.source === "auto" || t.source === "pendiente")).length;
  const income = ctx.settings.expectedIncome ?? detectIncome(ctx.history);
  // Lo que has cobrado de verdad este mes (ingresos ordinarios: nómina, intereses…; no regalos ni devoluciones).
  const incomeNow = round2(ctx.txs.filter((t) => t.kind === "ingreso" && t.amount > 0 && t.date >= current.start && t.date <= current.end).reduce((x, t) => x + t.amount, 0));
  const savingsGoal = ctx.projection.savingsGoal;
  // Logo de cada línea de Inicio (categoría, o categoría y subcategoría) cuando en los últimos meses todo viene de un
  // solo comercio conocido (la luz de Endesa, el móvil de Movistar): clave «categoría/subcategoría» o «categoría/*».
  const lineMerchants = new Map<string, Set<string>>();
  const addLine = (k: string, m: string) => { const s = lineMerchants.get(k) ?? new Set<string>(); s.add(m); lineMerchants.set(k, s); };
  const since = addDays(ctx.today, -120);
  for (const t of ctx.txs) {
    if (t.date < since || !isPackageCharge(t)) continue;
    const m = merchantKey(t.description, t.counterparty);
    addLine(`${t.category}/*`, m); addLine(`${t.category}/${t.subcategory ?? ""}`, m);
  }
  for (const r of ctx.recurring) if (r.amount < 0 && r.active) { addLine(`${r.category}/*`, r.key); addLine(`${r.category}/${r.subcategory ?? ""}`, r.key); }
  const lineDomains = await domainsFor([...lineMerchants.values()].flatMap((s) => [...s]));
  // Logo de lo que se repite (este mes y el que viene), por su comercio.
  const pend = currentMonthPending(ctx);
  const nxt = nextMonthCommitted(ctx);
  const keyOf = (i: object) => ("key" in i && typeof i.key === "string" ? i.key : "");
  const repeatDomains = await domainsFor([...pend.items, ...nxt.items, ...pend.cancelled, ...nxt.cancelled].map(keyOf));
  const withLogo = <T extends object>(i: T) => ({ ...i, logo: repeatDomains.get(keyOf(i)) ?? null });
  const lineLogo: Record<string, string> = {};
  for (const [k, s] of lineMerchants) if (s.size === 1) { const d = lineDomains.get([...s][0]); if (d) lineLogo[k] = d; }
  return {
    lineLogo,
    hasAccounts: ctx.accounts.length > 0,
    hasData: ctx.txs.length > 0,
    cycle: { ...current, day, totalDays },
    history,
    daily,
    extras: extras.sort((a, b) => b.amount - a.amount),
    planned: plannedOf(ctx.forecastItems),
    pending: pend.items.map(withLogo), cancelledNow: pend.cancelled.map(withLogo),
    next: { ...nxt, items: nxt.items.map(withLogo), cancelled: nxt.cancelled.map(withLogo) },
    committedCategories: ctx.settings.committedCategories,
    savingsByMonth: ctx.settings.savingsByMonth,
    budget: { income, incomeNow, othersGoal: ctx.settings.othersGoal, fromSettings: ctx.settings.expectedIncome !== null, savingsGoal, limit: income !== null && savingsGoal !== null ? round2(income - savingsGoal) : null },
    unknown: { perMonth: unknownSpend, count: unknownCount },
    // Deudas: gastos que pagaste en un mes y consumiste en otro («Es una deuda» al cambiar la fecha). El dinero
    // cuenta en el mes del pago (en Comprometido); el consumo se enseña en su mes, sin sumar.
    debts: ctx.txs.filter((t) => t.imputedDebt && t.imputedDate && isPackageCharge(t)).map((t) => ({
      id: t.id, title: t.alias?.trim() || t.counterparty || t.description, amount: round2(-t.amount), category: t.category, paidOn: t.date, consumedOn: t.imputedDate as string,
      // Inicio de cada mes (de nómina) para nombrarlos igual que en el aro.
      paidCycle: cycleFor(t.date, ctx.startDay).start, consumedCycle: cycleFor(t.imputedDate as string, ctx.startDay).start,
    })),
    // Préstamos temporales: lo que debes a cada persona (lo que te prestó menos lo que ya le has devuelto).
    loans: (() => {
      // La misma persona puede venir escrita distinto en cada Bizum («Palma G.C.» al recibir, «Palma Gomez Calero
      // Valdez» al devolver): se juntan por nombre de pila e iniciales (samePerson).
      const people: { key: string; tokens: string[]; name: string; owed: number }[] = [];
      for (const t of [...ctx.txs].sort((a, b) => a.date.localeCompare(b.date))) {
        if (t.kind !== "prestamo") continue;
        // Sin nombre en el concepto (algunos bancos ponen «Sin concepto»), la persona es el nombre que le diste.
        const tokens = personTokens(t.description, t.counterparty);
        const key = personKey(t.description, t.counterparty) || normalize(t.alias ?? "");
        const toks = tokens.length ? tokens : key.split(" ").filter(Boolean);
        if (!toks.length) continue;
        let x = people.find((p) => samePerson(p.tokens, toks));
        if (!x) { x = { key: key || toks.join(" "), tokens: toks, name: personName(toks.filter((w) => w.length > 1).join(" ") || key), owed: 0 }; people.push(x); }
        else if (toks.length > x.tokens.length) x.tokens = toks;
        x.owed = round2(x.owed + t.amount);
        if (t.amount > 0 && t.alias?.trim()) x.name = t.alias.trim();
      }
      return people.map(({ key, tokens, name, owed }) => ({ key, tokens, name, owed })).filter((x) => x.owed > 0.5).sort((a, b) => b.owed - a.owed);
    })(),
    // Dinero de cada ciclo (el anterior, este y el siguiente) para el medio aro de «Te quedan»: lo cobrado, lo
    // comprometido (lo que se repite), lo gastado (también los extraordinarios: es dinero que sale) y con cuánto
    // empezaste. El siguiente es previsión: lo que sueles cobrar y lo ya comprometido.
    money: (() => {
      const acc = ctx.accounts.filter((a) => a.included && a.currency === "EUR" && a.balance !== null);
      const fixedKeys = new Set(ctx.recurring.filter((r) => r.amount < 0 && (r.active || ctx.cancelled.has(r.key))).map((r) => r.key));
      const pend = currentMonthPending(ctx).items.reduce((t, i) => t + i.amount, 0);
      const one = (c: { start: string; end: string; label: string }, isCurrent: boolean) => {
        let inc = 0, fixed = 0, spent = 0;
        const incomeByCat: Record<string, number> = {};
        for (const t0 of ctx.txs) {
          const t = moneyDated(t0);
          if (t.date < c.start || t.date > c.end) continue;
          if (t.kind === "ingreso" && t.amount > 0) { inc += t.amount; incomeByCat[t.category] = round2((incomeByCat[t.category] ?? 0) + t.amount); }
          if (isPackageCharge(t)) { if (fixedKeys.has(merchantKey(t.description, t.counterparty))) fixed -= t.amount; else spent -= t.amount; }
        }
        // Lo que tenías al empezar: la foto del saldo del día anterior al ciclo si la hay (de cada cuenta); si no,
        // el saldo de hoy menos lo movido desde entonces (frágil: depende de que hoy esté todo listado).
        const dayBefore = addDays(c.start, -1);
        let carry = 0;
        for (const a of acc) {
          const snap = snaps.get(`${a.id}|${dayBefore}`);
          carry += snap ?? (a.balance ?? 0) - ctx.txs.filter((t) => t.accountId === a.id && t.date >= c.start).reduce((t, x) => t + x.amount, 0);
        }
        return { start: c.start, end: c.end, label: c.label, income: round2(inc), incomeByCat, fixed: round2(fixed + (isCurrent ? pend : 0)), spent: round2(spent), carry: round2(carry) };
      };
      const nextItems = nextMonthCommitted(ctx);
      return {
        prev: one(prevCycle, false),
        cur: one(current, true),
        next: { start: nextItems.cycle.start, end: nextItems.cycle.end, label: nextItems.cycle.label, income: round2(income ?? 0), fixed: round2(nextItems.items.reduce((t, i) => t + i.amount, 0)), spent: 0, carry: null as number | null },
      };
    })(),
    // Dinero real en tus cuentas (las incluidas, en euros): ahora y al empezar el ciclo (lo que traías del anterior).
    cash: (() => {
      const acc = ctx.accounts.filter((a) => a.included && a.currency === "EUR" && a.balance !== null);
      const ids = new Set(acc.map((a) => a.id));
      const now = round2(acc.reduce((t, a) => t + (a.balance ?? 0), 0));
      const since = ctx.txs.filter((t) => ids.has(t.accountId) && t.date >= current.start).reduce((t, x) => t + x.amount, 0);
      return { now, atStart: round2(now - since) };
    })(),
    previous: hasPrevious ? { start: prevCycle.start, end: prevTo } : null,
    /** Ciclos del último par de años (el actual primero), para el historial de una categoría. */
    cycles: Array.from({ length: 24 }, (_, i) => cycleFor(ctx.today, ctx.startDay, -i)).filter((c, i) => i === 0 || c.end >= oldest),
    groups: rows.map((g) => ({ id: g.id, name: g.name, categories: g.categories, goal: g.goal === null ? null : Number(g.goal), fixed: g.fixed })),
    totals: { now, before, extrasNow },
  };
}

/**
 * «Se repite» de un movimiento: si su comercio se repite (detectado por la app o marcado a mano), cada cuánto y si
 * lo has cancelado. Lo usa el detalle del movimiento.
 */
export async function transactionRecurring(userId: string, id: string) {
  const row = await prisma.finance_transactions.findFirst({ where: { id, user_id: userId }, select: { description: true, counterparty: true, amount: true } });
  if (!row) return null;
  const ctx = await financeContext(userId);
  const key = merchantKey(row.description, row.counterparty);
  const r = ctx.recurring.find((x) => x.key === key && x.amount < 0);
  return {
    key,
    on: !!r,
    manual: ctx.recurringOn.has(key),
    frequency: r?.frequency ?? null,
    nextDate: r?.nextDate ?? null,
    cancelled: ctx.cancelled.has(key),
  };
}
