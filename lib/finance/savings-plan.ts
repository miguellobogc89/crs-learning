// lib/finance/savings-plan.ts
// Plan de ahorro (24/11/2026, en laboratorio). Los números los calcula la app (lo que sueles gastar por categoría,
// lo que se repite, lo que cobras, lo que te sobra); la IA agrupa lo variable, propone límites y qué cancelar, y
// escribe 2-3 observaciones, según el objetivo que eligió el usuario. Después la app valida todo: nunca un límite por
// debajo de lo que se repite, nada que cancelar fuera de lo cancelable, el ahorro lo suma la app.
import "server-only";
import { planView } from "./service";
import { aiAvailable, financeJson } from "./ai";
import { categoryLabel, familyOf } from "./categories";

export type SavingsGoal = "sobra" | "cantidad" | "maximo" | "equilibrar";

/** Lo que se puede proponer cancelar (nunca vivienda, préstamos, seguros ni suministros). */
const CANCELLABLE = new Set(["suscripciones", "deporte", "videojuegos", "hobbies", "ocio", "conciertos_espectaculos"]);
const round5 = (n: number) => Math.round(n / 5) * 5;
const round25 = (n: number) => Math.round(n / 25) * 25;

/** La visión de partida: lo que cobras, lo que sueles gastar y en qué, lo que se repite y lo que te sobra. */
export async function savingsFacts(userId: string) {
  const v = await planView(userId);
  const closed = v.history.slice(1, 4);
  const n = Math.max(1, closed.length);
  const usual: Record<string, number> = {};
  for (const c of closed) for (const [k, x] of Object.entries(c.full)) usual[k] = (usual[k] ?? 0) + x / n;
  const repeats = (v.next?.items ?? []).filter((i) => i.source === "repite");
  const committed: Record<string, number> = {};
  for (const r of repeats) committed[r.category] = (committed[r.category] ?? 0) + r.amount;
  const cats = Object.entries(usual).filter(([, x]) => x >= 5).map(([key, x]) => {
    const c = Math.min(x, committed[key] ?? 0);
    return { key, label: categoryLabel(key), usual: Math.round(x), committed: Math.round(c), fixed: c > 0 && x - c <= Math.max(15, x * 0.1) };
  }).sort((a, b) => b.usual - a.usual);
  const income = Math.round(v.budget.income ?? 0);
  const spend = cats.reduce((t, c) => t + c.usual, 0);
  const surplus = income - spend;
  return {
    months: closed.length,
    income, spend, surplus,
    /** «Unos X € al mes»: lo que ya te sobra, con un pequeño empujón. */
    suggested: surplus > 0 ? Math.max(50, round25(surplus * 1.25)) : 0,
    cats,
    fixed: { total: cats.filter((c) => c.fixed).reduce((t, c) => t + c.usual, 0), count: repeats.length },
    recurring: repeats.map((r) => ({ title: r.title, amount: Math.round(r.amount * 100) / 100, category: r.category })),
  };
}
export type SavingsFacts = Awaited<ReturnType<typeof savingsFacts>>;

type AiPlan = { notes: string[]; groups: { name: string; categories: string[]; limit: number }[]; cancel: { title: string; reason: string }[] };

const GOAL_TEXT: Record<SavingsGoal, (f: SavingsFacts, target: number) => string> = {
  sobra: () => "Objetivo: «Lo que sobre, no quiero agobiarme». Toca muy poco: recorta solo lo que se ha disparado o es claramente excesivo para sus ingresos. No propongas cancelar nada salvo una suscripción claramente duplicada.",
  cantidad: (f, t) => `Objetivo: ahorrar unos ${t} € al mes y disfrutar del resto. Ya le sobran unos ${Math.max(0, f.surplus)} €; busca el resto (${Math.max(0, t - f.surplus)} €) donde menos duela (ocio, comida a domicilio, compras, moda). Puedes proponer cancelar suscripciones duplicadas.`,
  maximo: () => "Objetivo: ahorrar todo lo que pueda, aunque tenga que apretarse. Recorta con decisión lo variable no esencial (ocio, restaurantes, comida a domicilio, compras, moda: 15-30 %), algo el supermercado (5-10 %), y propone cancelar suscripciones o cuotas prescindibles o duplicadas.",
  equilibrar: (f) => `Gasta unos ${-f.surplus} € al mes más de lo que cobra. Objetivo: cerrar ese hueco. Recorta lo variable no esencial lo necesario y propone cancelar lo prescindible.`,
};

/** Propuesta de plan para un objetivo. Con IA si hay; si no (o falla), con reglas. */
export async function proposeSavingsPlan(userId: string, goal: SavingsGoal, target: number) {
  const f = await savingsFacts(userId);
  const variable = f.cats.filter((c) => !c.fixed);
  const cancellable = f.recurring.filter((r) => CANCELLABLE.has(r.category));
  let plan: AiPlan | null = null;
  let ai = false;
  if (aiAvailable() && variable.length) {
    try {
      plan = await financeJson<AiPlan>({
        tier: "fast",
        schemaName: "plan_ahorro",
        instructions: [
          "Eres el asistente de ahorro de una app de finanzas personales en España. Hablas de tú, en español, cercano y claro.",
          "Con los datos del usuario (medias de los últimos meses), propones un plan: agrupas sus gastos variables en 3-6 grupos con nombre natural (p. ej. «Alimentación», «Ocio y caprichos», «Transporte», «Compras y ropa»), con un límite mensual cada uno; propones qué cancelar si procede; y escribes 2-3 observaciones.",
          "Reglas: usa solo las categorías que te doy y cada una en un solo grupo. Límite de un grupo: nunca por debajo de lo que se repite en sus categorías ni por encima de lo que suele gastar. Cancelar: solo de la lista de cancelables, por su título exacto, con un motivo corto y concreto (p. ej. «Ya pagas Netflix y Disney+»).",
          "Observaciones: máximo 3, de una frase (menos de 140 caracteres), con números de sus propios datos (lo que gasta, qué parte de lo que cobra, qué ha subido). Nunca compares con «lo normal» ni con otras personas; nada de vivienda, préstamos ni seguros.",
          GOAL_TEXT[goal](f, target),
        ].join("\n"),
        input: JSON.stringify({
          cobra_al_mes: f.income, gasta_al_mes: f.spend, le_sobra: f.surplus,
          gastos_fijos_que_se_repiten: f.fixed.total,
          gastos_variables: variable.map((c) => ({ categoria: c.key, nombre: c.label, suele_gastar: c.usual, se_repite: c.committed })),
          cancelables: cancellable.map((r) => ({ titulo: r.title, al_mes: r.amount })),
        }),
        schema: {
          type: "object", additionalProperties: false, required: ["notes", "groups", "cancel"],
          properties: {
            notes: { type: "array", items: { type: "string" } },
            groups: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "categories", "limit"], properties: {
              name: { type: "string" }, categories: { type: "array", items: { type: "string", enum: variable.map((c) => c.key) } }, limit: { type: "number" },
            } } },
            cancel: { type: "array", items: { type: "object", additionalProperties: false, required: ["title", "reason"], properties: { title: { type: "string" }, reason: { type: "string" } } } },
          },
        },
        maxOutputTokens: 3000,
      });
      ai = true;
    } catch (e) {
      console.error("[finance] plan de ahorro con IA", e instanceof Error ? e.message.slice(0, 200) : e);
    }
  }
  if (!plan) plan = rulesPlan(f, goal);

  // Validación: categorías conocidas y sin repetir; límites entre lo que se repite y lo que suele gastar; lo que la
  // IA no haya agrupado va a «Otros gastos» con lo de siempre.
  const byKey = new Map(variable.map((c) => [c.key, c]));
  const used = new Set<string>();
  const groups = plan.groups.map((g) => {
    const categories = g.categories.filter((k) => byKey.has(k) && !used.has(k));
    categories.forEach((k) => used.add(k));
    const usual = categories.reduce((t, k) => t + (byKey.get(k)?.usual ?? 0), 0);
    const committed = categories.reduce((t, k) => t + (byKey.get(k)?.committed ?? 0), 0);
    const limit = Math.min(usual, Math.max(Math.ceil(committed), round5(g.limit)));
    return { name: g.name.trim().slice(0, 40) || "Grupo", categories, usual, committed, limit };
  }).filter((g) => g.categories.length);
  const rest = variable.filter((c) => !used.has(c.key));
  if (rest.length) groups.push({ name: "Otros gastos", categories: rest.map((c) => c.key), usual: rest.reduce((t, c) => t + c.usual, 0), committed: rest.reduce((t, c) => t + c.committed, 0), limit: rest.reduce((t, c) => t + c.usual, 0) });
  const seen = new Set<string>();
  const cancel = plan.cancel.map((c) => ({ ...c, item: cancellable.find((r) => r.title === c.title) }))
    .filter((c) => c.item && !seen.has(c.title) && seen.add(c.title))
    .map((c) => ({ title: c.title, amount: c.item!.amount, category: c.item!.category, reason: c.reason.trim().slice(0, 140) }));
  const saving = Math.round(groups.reduce((t, g) => t + (g.usual - g.limit), 0) + cancel.reduce((t, c) => t + c.amount, 0));
  return { facts: f, goal, target, ai, notes: plan.notes.map((x) => x.trim()).filter(Boolean).slice(0, 3), groups, cancel, saving };
}

/** Sin IA: un grupo por familia, recortes según el objetivo en lo que se puede recortar. */
function rulesPlan(f: SavingsFacts, goal: SavingsGoal): AiPlan {
  const cut: Record<SavingsGoal, Record<string, number>> = {
    sobra: { ocio: 0.05, compras: 0.05 },
    cantidad: { ocio: 0.15, compras: 0.15, alimentacion: 0.05 },
    maximo: { ocio: 0.25, compras: 0.25, alimentacion: 0.1, servicios: 0.1, transporte: 0.1 },
    equilibrar: { ocio: 0.25, compras: 0.25, alimentacion: 0.1, servicios: 0.1, transporte: 0.1 },
  };
  const fam = new Map<string, { name: string; categories: string[]; usual: number }>();
  for (const c of f.cats.filter((x) => !x.fixed)) {
    const fm = familyOf(c.key);
    const g = fam.get(fm.key) ?? { name: fm.key === "ocio" ? "Ocio y caprichos" : fm.label, categories: [], usual: 0 };
    g.categories.push(c.key); g.usual += c.usual; fam.set(fm.key, g);
  }
  const groups = [...fam.entries()].map(([k, g]) => ({ name: g.name, categories: g.categories, limit: g.usual * (1 - (cut[goal][k] ?? 0)) }));
  return { notes: [], groups, cancel: [] };
}
