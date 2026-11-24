"use client";
// Laboratorio · «Crear mi plan de ahorro» (24/11/2026). Arriba se elige con qué datos probar: los tuyos o un perfil
// de prueba (Datos de prueba). La historia: Mi plan vacío → (si hay mucho sin entender, primero revisarlo) →
// «Analizando tus últimos meses…» → tu situación y la pregunta del objetivo (o, si gastas más de lo que cobras,
// equilibrarlo) → la IA prepara el plan → observaciones, grupos con límite, qué cancelar y lo que ahorrarías →
// «Aplicar plan». Los números los calcula la app; la IA propone dentro de sus reglas (lib/finance/savings-plan.ts).
// Prueba: no guarda nada.
import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight, Loader2 } from "lucide-react";
import type { planView } from "@/lib/finance/service";
import type { proposeSavingsPlan, SavingsFacts, SavingsGoal } from "@/lib/finance/savings-plan";
import { LAB_PROFILES } from "@/lib/finance/lab-data";
import { eur } from "@/components/trading/format";
import { ErrorNote } from "@/components/trading/ui";
import { SkeletonList } from "@/components/trading/skeletons";
import { fapi, setLabProfile, useFinance } from "./api";
import { CategoryIcon } from "./category-icon";

type Plan = Awaited<ReturnType<typeof planView>>;
type Proposal = Awaited<ReturnType<typeof proposeSavingsPlan>>;
type Step = "inicio" | "analizando" | "pregunta" | "preparando" | "resultado" | "aplicado";

/** Si lo que la app no entiende pesa más que esto, primero conviene revisarlo (el plan saldría peor). */
const UNKNOWN_LIMIT = 0.15;

/** Con qué datos se prueba: los tuyos o un perfil de prueba (sus lecturas van a su usuario ficticio). */
export function LabSavingsPlan() {
  const [profile, setProfile] = useState<string | null>(null);
  useEffect(() => () => setLabProfile(null), []);
  const pick = (p: string | null) => { setLabProfile(p); setProfile(p); };
  return (
    <div>
      <div className="-mx-3 mb-4 flex gap-2 overflow-x-auto px-3 [scrollbar-width:none]">
        {[{ key: null as string | null, label: "Tus datos" }, ...LAB_PROFILES.map((p) => ({ key: p.key as string | null, label: p.label }))].map((p) => (
          <button key={p.key ?? "yo"} type="button" onClick={() => pick(p.key)} aria-pressed={profile === p.key}
            className={`h-8 shrink-0 rounded-full px-3.5 text-sm font-medium ${profile === p.key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}>
            {p.label}
          </button>
        ))}
      </div>
      <SavingsPlanFlow key={profile ?? "yo"} />
    </div>
  );
}

function SavingsPlanFlow() {
  const { data, error } = useFinance<Plan>("plan");
  const [step, setStep] = useState<Step>("inicio");
  const [facts, setFacts] = useState<SavingsFacts | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [limits, setLimits] = useState<Record<string, string>>({});
  const [cancelOn, setCancelOn] = useState<Record<string, boolean>>({});
  const [ignoreUnknown, setIgnoreUnknown] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const start = async () => {
    setErr(null); setStep("analizando");
    try {
      const [f] = await Promise.all([fapi<SavingsFacts>("savings/facts"), new Promise((r) => setTimeout(r, 1200))]);
      setFacts(f); setStep("pregunta");
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setStep("inicio"); }
  };
  const choose = async (goal: SavingsGoal, target = 0) => {
    setErr(null); setStep("preparando");
    try {
      const p = await fapi<Proposal>("savings/propose", { goal, target });
      setProposal(p);
      setLimits(Object.fromEntries(p.groups.map((g) => [g.name, String(g.limit)])));
      setCancelOn(Object.fromEntries(p.cancel.map((c) => [c.title, true])));
      setStep("resultado");
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setStep("pregunta"); }
  };

  if (error && !data) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <SkeletonList rows={5} />;
  if (!data.hasData) return <p className="py-10 text-center text-sm text-slate-500">Este perfil aún no tiene datos. Créalo en «Datos de prueba».</p>;

  const closed = data.history.slice(1, 4);
  const spendAll = closed.reduce((t, c) => t + Object.values(c.full).reduce((u, x) => u + x, 0), 0) / Math.max(1, closed.length);
  const unknownShare = spendAll > 0 ? data.unknown.perMonth / spendAll : 0;
  const blocked = unknownShare > UNKNOWN_LIMIT && !ignoreUnknown;
  const spinner = (title: string, sub: string) => (
    <div className="flex flex-col items-center py-16 text-center">
      <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      <p className="mt-4 text-[15px] font-medium text-slate-800">{title}</p>
      <p className="mt-1 max-w-xs text-sm text-slate-500">{sub}</p>
    </div>
  );

  if (step === "inicio") return (
    <div className="py-6 text-center">
      {err && <ErrorNote>{err}</ErrorNote>}
      <p className="text-[22px] font-semibold leading-tight tracking-tight text-slate-900">Ahorra mes a mes</p>
      <p className="mx-auto mt-2 max-w-xs text-sm text-slate-500">Analizamos tus últimos meses y te proponemos un plan: cuánto gastar en cada cosa y cuánto ahorrarías.</p>
      {blocked ? (
        <div className="mx-auto mt-6 max-w-sm rounded-2xl bg-amber-50 px-4 py-4 text-left">
          <p className="text-sm font-semibold text-amber-900">Antes, ayúdanos a entender tus gastos</p>
          <p className="amount mt-1 text-sm text-amber-800">Hay {data.unknown.count} movimientos (unos {eur(data.unknown.perMonth, 0)} al mes) que no sabemos qué son. Si los clasificas, el plan saldrá mucho mejor.</p>
          <Link href="/finanzas/movimientos?revisar=1" className="mt-3 inline-flex items-center gap-0.5 text-sm font-semibold text-blue-700">Revisarlos<ChevronRight className="h-4 w-4" /></Link>
          <button type="button" onClick={() => setIgnoreUnknown(true)} className="mt-1 block text-xs text-amber-700 underline">Crear el plan igualmente</button>
        </div>
      ) : (
        <button type="button" onClick={() => void start()} className="mt-6 inline-flex h-11 items-center rounded-full bg-blue-600 px-6 text-[15px] font-semibold text-white active:bg-blue-700">Crear mi plan de ahorro</button>
      )}
      <p className="mt-6 text-[11px] text-slate-400">Prueba: sin entender, {data.unknown.count} movimientos ({Math.round(unknownShare * 100)} % del gasto; aviso a partir del {UNKNOWN_LIMIT * 100} %).</p>
    </div>
  );

  if (step === "analizando") return spinner("Analizando tus últimos meses…", "Lo que cobras, lo que se repite y en qué se te va el dinero.");
  if (step === "preparando") return spinner("Preparando tu plan…", "Buscando dónde puedes ahorrar sin tocar lo imprescindible.");

  if (step === "pregunta" && facts) {
    const short = facts.surplus < 0;
    const option = (label: string, sub: string, onClick: () => void) => (
      <button type="button" onClick={onClick} className="w-full rounded-2xl border border-slate-200 px-4 py-3.5 text-left active:bg-slate-50">
        <span className="block text-[15px] font-semibold text-slate-900">{label}</span>
        <span className="block text-sm text-slate-500">{sub}</span>
      </button>
    );
    return (
      <div className="pb-4">
        {err && <ErrorNote>{err}</ErrorNote>}
        <p className="text-sm text-slate-500">En tus últimos {facts.months} meses</p>
        <dl className="amount mt-2 space-y-1.5 text-[15px]">
          <div className="flex justify-between"><dt className="text-slate-600">Cobras</dt><dd className="font-semibold text-slate-900">~{eur(facts.income, 0)} al mes</dd></div>
          <div className="flex justify-between"><dt className="text-slate-600">Gastas</dt><dd className="font-semibold text-slate-900">~{eur(facts.spend, 0)} al mes</dd></div>
          <div className="flex justify-between border-t border-slate-100 pt-1.5"><dt className="text-slate-600">{short ? "Te faltan" : "Te sobran"}</dt><dd className={`font-semibold ${short ? "text-rose-700" : "text-emerald-700"}`}>~{eur(Math.abs(facts.surplus), 0)} al mes</dd></div>
        </dl>
        {short ? (
          <>
            <p className="mt-6 text-[20px] font-semibold leading-tight tracking-tight text-slate-900">Ahora mismo gastas más de lo que cobras</p>
            <p className="mt-1 text-sm text-slate-500">Primero, vamos a equilibrarlo: te proponemos dónde recortar para llegar a fin de mes.</p>
            <button type="button" onClick={() => void choose("equilibrar")} className="mt-4 inline-flex h-11 items-center rounded-full bg-blue-600 px-6 text-[15px] font-semibold text-white">Vamos</button>
          </>
        ) : (
          <>
            <p className="mt-6 text-[20px] font-semibold leading-tight tracking-tight text-slate-900">¿Cuánto quieres ahorrar?</p>
            <div className="mt-3 space-y-2">
              {option("Lo que sobre", "No quiero agobiarme", () => void choose("sobra"))}
              {option(`Unos ${eur(facts.suggested, 0)} al mes`, "Y disfrutar del resto", () => void choose("cantidad", facts.suggested))}
              {option("Todo lo que pueda", "Aunque tenga que apretarme", () => void choose("maximo"))}
            </div>
          </>
        )}
      </div>
    );
  }

  if (!proposal) return null;
  const rows = proposal.groups.map((g) => {
    const v = Math.min(g.usual, Math.max(Math.ceil(g.committed), Number((limits[g.name] ?? "").replace(",", ".")) || 0));
    return { g, v, saving: Math.max(0, Math.round(g.usual - v)) };
  });
  const saving = rows.reduce((t, r) => t + r.saving, 0) + proposal.cancel.filter((c) => cancelOn[c.title]).reduce((t, c) => t + c.amount, 0);
  const f = proposal.facts;

  return (
    <div className="pb-4">
      <p className="text-[22px] font-semibold leading-tight tracking-tight text-slate-900">He analizado tus gastos</p>
      <ul className="mt-3 space-y-2">
        {proposal.notes.map((t) => <li key={t} className="amount rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-700">{t}</li>)}
      </ul>

      <p className="amount mt-6 text-[26px] font-semibold leading-none tracking-tight text-emerald-700">~{eur(saving, 0)} al mes</p>
      <p className="amount mt-1 text-sm text-slate-500">
        {proposal.goal === "equilibrar"
          ? saving >= -f.surplus ? `cierras el hueco de ${eur(-f.surplus, 0)} y llegas a fin de mes` : `te faltarían aún ${eur(-f.surplus - saving, 0)} para llegar a fin de mes`
          : `más de lo que ya te sobra: ahorrarías ~${eur(Math.max(0, f.surplus) + saving, 0)} al mes`}
      </p>

      <h3 className="mt-6 text-sm font-medium text-slate-500">Tu plan</h3>
      <ul className="mt-1 divide-y divide-slate-100">
        {rows.map(({ g, saving: s }) => (
          <li key={g.name} className="flex items-center gap-3 py-3">
            <CategoryIcon category={g.categories[0]} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold text-slate-900">{g.name}</span>
              <span className="amount block truncate text-xs text-slate-500">Sueles ~{eur(g.usual, 0)}{s > 0 ? <span className="text-emerald-700"> · ahorras {eur(s, 0)}</span> : ""}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <input inputMode="decimal" aria-label={`Límite de ${g.name}`} value={limits[g.name] ?? ""} onChange={(e) => setLimits((l) => ({ ...l, [g.name]: e.target.value }))}
                className="amount w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-right text-[15px] font-semibold tabular-nums text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
              <span className="text-sm text-slate-500">€</span>
            </span>
          </li>
        ))}
      </ul>

      {proposal.cancel.length > 0 && (
        <>
          <h3 className="mt-6 text-sm font-medium text-slate-500">Podrías cancelar</h3>
          <ul className="mt-1 divide-y divide-slate-100">
            {proposal.cancel.map((c) => (
              <li key={c.title}>
                <label className="flex items-center gap-3 py-3">
                  <CategoryIcon category={c.category} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-slate-900">{c.title}</span>
                    <span className="block text-xs text-slate-500">{c.reason}</span>
                  </span>
                  <span className="amount shrink-0 text-sm font-semibold tabular-nums text-emerald-700">−{eur(c.amount, 2)}</span>
                  <input type="checkbox" checked={!!cancelOn[c.title]} onChange={(e) => setCancelOn((x) => ({ ...x, [c.title]: e.target.checked }))} className="h-5 w-5 accent-blue-600" />
                </label>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Lo que se repite: sin límite (no tiene sentido ponérselo a la hipoteca); solo baja si cancelas algo. */}
      <div className="mt-4 flex items-center gap-3 border-t border-slate-100 py-3">
        <span className="opacity-60 grayscale"><CategoryIcon category="suscripciones" /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold text-slate-700">Lo que pagas cada mes</span>
          <span className="block truncate text-xs text-slate-500">Recibos fijos · solo baja si cancelas algo</span>
        </span>
        <b className="amount shrink-0 text-[15px] font-semibold tabular-nums text-slate-700">{eur(f.fixed.total, 0)}</b>
      </div>

      {step === "aplicado" ? (
        <p className="mt-4 rounded-xl bg-emerald-50 px-3 py-3 text-sm font-medium text-emerald-800">Plan aplicado (en la prueba no se guarda).</p>
      ) : (
        <div className="mt-4 flex items-center gap-3">
          <button type="button" onClick={() => setStep("aplicado")} className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-blue-600 text-[15px] font-semibold text-white active:bg-blue-700">Aplicar plan</button>
          <button type="button" onClick={() => setStep("pregunta")} className="h-11 px-3 text-sm font-medium text-slate-500">Cambiar objetivo</button>
        </div>
      )}
      <p className="mt-3 text-[11px] text-slate-400">{proposal.ai ? "Propuesta de la IA, validada por la app." : "Sin IA (no disponible o falló): propuesta por reglas."}</p>
    </div>
  );
}
