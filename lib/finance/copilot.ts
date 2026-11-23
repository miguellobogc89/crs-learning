// lib/finance/copilot.ts
// Copiloto financiero: conversa con la IA, pero las cifras salen siempre de las herramientas (logic.ts),
// nunca de la memoria del modelo. Recuerda el contexto que la persona le cuenta (finance_memory).
import "server-only";
import { prisma } from "@/lib/prisma";
import { getOpenAIClient } from "@/lib/ai/openai";
import { recordAiUsage } from "@/lib/ai/usage";
import { CATEGORIES, KINDS, categoryLabel } from "./categories";
import { affordability, cycleFor, detectAlerts, projectSavings, summarize } from "./logic";
import { financeModel, isReasoningModel } from "./ai";
import { financeContext, searchTxs, type FinanceContext } from "./service";
import { getMemory } from "./store";

const MAX_ROUNDS = 6;
const HISTORY_MESSAGES = 16;

type ToolDef = { type: "function"; name: string; description: string; parameters: Record<string, unknown>; strict: boolean };

const obj = (properties: Record<string, unknown>, required: string[] = Object.keys(properties)) => ({ type: "object", additionalProperties: false, properties, required });
const nullable = (t: string, extra: Record<string, unknown> = {}) => ({ type: [t, "null"], ...extra });

const TOOLS: ToolDef[] = [
  {
    type: "function", strict: true, name: "resumen_ciclo",
    description: "Ingresos, gastos (por categoría), fijos/variables/extraordinarios, ahorro neto y presupuestos de un ciclo. offset 0 = ciclo actual, -1 = el anterior…",
    parameters: obj({ offset: { type: "integer" } }),
  },
  {
    type: "function", strict: true, name: "comparar_ciclos",
    description: "Resumen de los últimos N ciclos completos (más reciente primero) para ver tendencias y comparar categorías.",
    parameters: obj({ n: { type: "integer" } }),
  },
  {
    type: "function", strict: true, name: "buscar_movimientos",
    description: "Busca movimientos por texto (comercio o concepto), categoría, tipo y fechas (AAAA-MM-DD). Devuelve número, suma (negativo = salida) y la lista.",
    parameters: obj({
      texto: nullable("string"),
      categoria: nullable("string", { enum: [...CATEGORIES.map((c) => c.key), null] }),
      tipo: nullable("string", { enum: [...KINDS, null] }),
      desde: nullable("string"),
      hasta: nullable("string"),
    }),
  },
  {
    type: "function", strict: true, name: "prevision_ciclo",
    description: "Proyección del ciclo actual: saldo previsto al acabar, recibos y cobros pendientes, gasto variable esperado, ahorro previsto y cuánto se puede gastar sin comprometer el objetivo.",
    parameters: obj({}),
  },
  {
    type: "function", strict: true, name: "puedo_permitirme",
    description: "Efecto de un gasto extraordinario sobre el ahorro del ciclo, el objetivo de ahorro y la liquidez prevista.",
    parameters: obj({ importe: { type: "number" } }),
  },
  {
    type: "function", strict: true, name: "ahorro_hasta",
    description: "Ahorro y liquidez previstos hasta una fecha (AAAA-MM-DD) si se sigue como en los últimos ciclos.",
    parameters: obj({ fecha: { type: "string" } }),
  },
  {
    type: "function", strict: true, name: "recurrentes",
    description: "Suscripciones, recibos fijos y cobros periódicos detectados (importe, frecuencia, próxima fecha, activos o no).",
    parameters: obj({}),
  },
  {
    type: "function", strict: true, name: "avisos",
    description: "Avisos actuales: posibles duplicados, gastos inusuales, subidas de precio, suscripciones nuevas, presupuestos y cambios de hábitos.",
    parameters: obj({}),
  },
  {
    type: "function", strict: true, name: "recordar",
    description: "Guarda un dato de contexto personal que la persona te ha contado y que debe recordarse en el futuro (p. ej. «cancelé Netflix en octubre», «la transferencia de 300 € a Ana es su parte del alquiler», «el viaje a Roma fue excepcional»). Solo hechos que ella ha dicho.",
    parameters: obj({ nota: { type: "string" } }),
  },
];

function cycleOut(s: ReturnType<typeof summarize>) {
  return {
    ciclo: `${s.cycle.label} (${s.cycle.start} a ${s.cycle.end})`,
    ingresos: s.income,
    regalos_recibidos: s.gifts,
    gastos: s.expenses,
    gastos_fijos: s.fixedExpenses,
    gastos_variables: s.variableExpenses,
    gastos_extraordinarios: s.extraordinaryExpenses,
    aportado_a_inversion: s.savedToInvestments,
    ahorro_neto: s.net,
    tasa_ahorro_pct: s.savingsRate,
    por_categoria: s.byCategory.map((c) => ({ categoria: categoryLabel(c.category), clave: c.category, importe: c.amount })),
    movimientos: s.count,
  };
}

async function runTool(ctx: FinanceContext, name: string, args: Record<string, unknown>) {
  const recurringKeys = new Set(ctx.recurring.filter((r) => r.active).map((r) => r.key));
  switch (name) {
    case "resumen_ciclo": {
      const offset = Math.max(-24, Math.min(0, Number(args.offset) || 0));
      const s = offset === 0 ? ctx.current : summarize(ctx.txs, cycleFor(ctx.today, ctx.startDay, offset), recurringKeys);
      return { ...cycleOut(s), ...(offset === 0 ? { hoy: ctx.today, presupuestos: ctx.budgetsNow.map((b) => ({ nombre: b.name, limite: b.amount, gastado: b.spent, queda: b.remaining, pct: b.pct, pct_ciclo_transcurrido: b.expectedPct })) } : {}) };
    }
    case "comparar_ciclos": {
      const n = Math.max(1, Math.min(12, Number(args.n) || 3));
      return ctx.history.slice(0, n).map(cycleOut);
    }
    case "buscar_movimientos":
      return searchTxs(ctx, { text: (args.texto as string) || undefined, category: (args.categoria as string) || undefined, kind: (args.tipo as string) || undefined, from: (args.desde as string) || undefined, to: (args.hasta as string) || undefined });
    case "prevision_ciclo": {
      const p = ctx.projection;
      return {
        ciclo: `${p.cycle.label} (${p.cycle.start} a ${p.cycle.end})`, hoy: p.today, dias_restantes: p.daysLeft,
        liquidez_hoy: p.liquidity, cobros_pendientes: p.pendingIncome, recibos_pendientes: p.pendingFixed,
        gasto_variable_esperado: p.expectedVariable, gasto_variable_diario: p.variableDaily,
        saldo_previsto_fin_ciclo: p.projectedEndBalance, ahorro_neto_previsto_ciclo: p.projectedNet,
        objetivo_ahorro: p.savingsGoal, margen_para_gastar_sin_romper_objetivo: p.safeToSpend,
        pendientes: p.pending, base_del_calculo: p.basis,
        ya_llevas: { ingresos: ctx.current.income, gastos: ctx.current.expenses, ahorro_neto: ctx.current.net },
      };
    }
    case "puedo_permitirme": {
      const amount = Math.abs(Number(args.importe) || 0);
      return { ...affordability(ctx.projection, amount), nota: "verdict: si (sin romper el objetivo), con_ajustes (rompe el objetivo de ahorro), no (saldo previsto negativo)" };
    }
    case "ahorro_hasta": {
      const until = typeof args.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(args.fecha) ? args.fecha : cycleFor(ctx.today, ctx.startDay, 2).end;
      return projectSavings(ctx.history, ctx.projection, until, ctx.startDay);
    }
    case "recurrentes":
      return ctx.recurring.map((r) => ({ nombre: r.label, categoria: categoryLabel(r.category), importe: r.amount, frecuencia: r.frequency, ultimo: r.lastDate, proximo: r.nextDate, activo: r.active, desde: r.firstDate, veces: r.count }));
    case "avisos":
      return detectAlerts({ txs: ctx.txs, today: ctx.today, recurring: ctx.recurring, history: ctx.history, current: ctx.current, budgets: ctx.budgetsNow }).map((a) => ({ nivel: a.level, titulo: a.title, detalle: a.body }));
    case "recordar": {
      const note = String(args.nota ?? "").trim().slice(0, 400);
      if (!note) return { ok: false };
      await prisma.finance_memory.create({ data: { user_id: ctx.userId, content: note } });
      return { ok: true, guardado: note };
    }
    default:
      return { error: `Herramienta desconocida: ${name}` };
  }
}

function instructions(ctx: FinanceContext, memory: string[]) {
  const accounts = ctx.accounts.filter((a) => a.included).map((a) => `${a.bank ?? "importada"} · ${a.name}${a.balance !== null ? ` (saldo ${a.balance.toFixed(2)} ${a.currency})` : ""}`);
  return [
    "Eres el copiloto financiero personal de CRS Finance. Hablas en español de España, claro y directo, como un asesor sincero.",
    "REGLAS:",
    "- Toda cifra sale de tus herramientas. Si necesitas un dato, llama a la herramienta; nunca inventes ni estimes de memoria.",
    "- Enseña el cálculo de forma verificable y breve (de dónde sale cada número, qué ciclo, qué movimientos).",
    "- Sé crítico: si algo no cuadra, si la persona se está engañando o si un gasto compromete su objetivo, dilo con claridad y sin dar la razón por darla. Da recomendaciones concretas y priorizadas.",
    "- Los traspasos entre cuentas propias no son gasto; las aportaciones a inversión son ahorro; los regalos recibidos no son ingreso ordinario; los extraordinarios no se proyectan.",
    "- Si la persona cuenta algo de su vida financiera que debe recordarse (una suscripción cancelada, una devolución pendiente, que un gasto fue puntual), guárdalo con «recordar».",
    "- Formato: frases cortas y listas cuando ayuden. Importes con punto de miles y coma decimal (1.234,56 €). Negrita con **dobles asteriscos** solo para la cifra clave. Sin tablas.",
    "- No das asesoramiento de inversión en productos concretos; sí sobre presupuesto, ahorro y liquidez.",
    `Hoy es ${ctx.today}. El ciclo económico empieza el día ${ctx.startDay} de cada mes (ciclo actual: ${ctx.current.cycle.label}).`,
    ctx.settings.savingsGoal !== null ? `Objetivo de ahorro: ${ctx.settings.savingsGoal.toFixed(2)} € por ciclo.` : "No ha fijado objetivo de ahorro.",
    ctx.budgets.length ? `Límites de gasto: ${ctx.budgets.map((b) => `${b.name} ${b.amount.toFixed(2)} € (${b.categories.map(categoryLabel).join(", ") || "todo el gasto"})`).join("; ")}.` : "",
    `Cuentas: ${accounts.join("; ") || "ninguna todavía"}.`,
    memory.length ? `Lo que la persona te ha contado (recuérdalo):\n${memory.map((m) => `- ${m}`).join("\n")}` : "",
  ].filter(Boolean).join("\n");
}

export async function chatHistory(userId: string) {
  const rows = await prisma.finance_chat_messages.findMany({ where: { user_id: userId }, orderBy: { created_at: "desc" }, take: 60 });
  return rows.reverse().map((m) => ({ id: m.id, role: m.role as "user" | "assistant", content: m.content, createdAt: m.created_at.toISOString() }));
}

export async function clearChat(userId: string) {
  await prisma.finance_chat_messages.deleteMany({ where: { user_id: userId } });
}

type FunctionCall = { type: "function_call"; name: string; arguments: string; call_id: string };

export async function ask(userId: string, question: string) {
  const text = question.trim().slice(0, 2000);
  if (!text) throw new Error("Escribe una pregunta");
  const [ctx, memory, past] = await Promise.all([
    financeContext(userId),
    getMemory(userId),
    prisma.finance_chat_messages.findMany({ where: { user_id: userId }, orderBy: { created_at: "desc" }, take: HISTORY_MESSAGES }),
  ]);
  await prisma.finance_chat_messages.create({ data: { user_id: userId, role: "user", content: text } });
  const model = financeModel("smart");
  const client = getOpenAIClient();
  const history = past.reverse().map((m) => ({ role: m.role === "assistant" ? ("assistant" as const) : ("user" as const), content: m.content }));
  const base = {
    model,
    instructions: instructions(ctx, memory.map((m) => m.content)),
    tools: TOOLS,
    ...(isReasoningModel(model) ? { reasoning: { effort: "low" as const } } : {}),
    max_output_tokens: 4000,
  };
  let response = await client.responses.create({ ...base, input: [...history, { role: "user" as const, content: text }] }, { timeout: 60_000, maxRetries: 1 });
  await recordAiUsage("finance", "copiloto", model, response.usage?.input_tokens ?? 0, response.usage?.output_tokens ?? 0);
  const used: string[] = [];
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const calls = (response.output ?? []).filter((o): o is typeof o & FunctionCall => o.type === "function_call");
    if (!calls.length) break;
    const outputs: { type: "function_call_output"; call_id: string; output: string }[] = [];
    for (const call of calls) {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(call.arguments || "{}"); } catch { /* argumentos vacíos */ }
      used.push(call.name);
      let result: unknown;
      try { result = await runTool(ctx, call.name, args); } catch (e) { result = { error: e instanceof Error ? e.message : "error" }; }
      outputs.push({ type: "function_call_output" as const, call_id: call.call_id, output: JSON.stringify(result) });
    }
    response = await client.responses.create({ ...base, previous_response_id: response.id, input: outputs }, { timeout: 60_000, maxRetries: 1 });
    await recordAiUsage("finance", "copiloto", model, response.usage?.input_tokens ?? 0, response.usage?.output_tokens ?? 0);
  }
  const answer = response.output_text?.trim() || "No he podido completar la respuesta. Inténtalo de nuevo.";
  const saved = await prisma.finance_chat_messages.create({ data: { user_id: userId, role: "assistant", content: answer } });
  return { id: saved.id, role: "assistant" as const, content: answer, createdAt: saved.created_at.toISOString(), tools: [...new Set(used)] };
}
