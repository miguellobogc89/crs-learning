"use client";
// Preferencias: ciclo económico, reglas que la app ha aprendido de tus correcciones y lo que recuerda el copiloto.
import { useEffect, useState } from "react";
import { Brain, CalendarDays, Loader2, Trash2, Wand2 } from "lucide-react";
import { Combobox } from "@/components/ui/combobox";
import { KIND_LABEL, type Kind } from "@/lib/finance/categories";
import { card, field, flat, ghost } from "@/components/trading/format";
import { CardHeader, ErrorNote, Pill, SectionTitle } from "@/components/trading/ui";
import { SkeletonList } from "@/components/trading/skeletons";
import { errorText, fapi, longDay, refreshFinance, useFinance } from "./api";

type View = {
  settings: { cycleStartDay: number; savingsGoal: number | null };
  rules: { id: string; pattern: string; category: string; categoryLabel: string; kind: Kind; extraordinary: boolean; hits: number; label: string | null }[];
  memory: { id: string; content: string; createdAt: string }[];
};

export function SettingsPanel() {
  const { data, error } = useFinance<View>("settings");
  const [day, setDay] = useState("25");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (data) setDay(String(data.settings.cycleStartDay));
  }, [data]);
  if (error && !data) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <SkeletonList rows={6} />;

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setErr(null);
    try {
      await fn();
      refreshFinance();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4 pb-4">
      {err && <ErrorNote>{err}</ErrorNote>}
      <section className={`${card} ${flat} p-4 sm:p-6`}>
        <SectionTitle icon={CalendarDays} tint="blue" size="base">Ciclo económico</SectionTitle>
        <p className="mt-2 text-sm text-slate-500">El día en que empieza tu mes económico (normalmente cuando cobras). Todos los resúmenes, límites y previsiones van de ese día al anterior del mes siguiente.</p>
        <form className="mt-4 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); void run("day", () => fapi("settings", { cycleStartDay: Number(day) })); }}>
          <span className="text-sm text-slate-700">Empieza el día</span>
          <Combobox value={day} onChange={setDay} ariaLabel="Día de inicio del ciclo" className="h-9 w-18"
            options={Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))} />
          <span className="text-sm text-slate-500">de cada mes</span>
          <button type="submit" disabled={busy === "day"} className={ghost}>{busy === "day" && <Loader2 className="h-4 w-4 animate-spin" />} Guardar</button>
        </form>
      </section>

      <section className={`${card} ${flat}`}>
        <CardHeader divider><SectionTitle icon={Brain} tint="violet" size="base">Lo que recuerda el copiloto</SectionTitle></CardHeader>
        <form className="flex gap-2 px-4 pt-4 sm:px-6" onSubmit={(e) => { e.preventDefault(); if (note.trim()) void run("mem", async () => { await fapi("memory", { content: note }); setNote(""); }); }}>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="P. ej. «Cancelé HBO en octubre» o «El viaje a Roma fue excepcional»" className={`${field} min-w-0 flex-1`} />
          <button type="submit" disabled={busy === "mem" || !note.trim()} className={ghost}>Añadir</button>
        </form>
        {data.memory.length === 0 ? <p className="px-6 py-5 text-sm text-slate-500">Todavía nada. El copiloto guarda aquí lo que le cuentes y lo usa para clasificar y responder.</p> : (
          <ul className="mt-2 divide-y divide-slate-100">
            {data.memory.map((m) => (
              <li key={m.id} className="flex items-start gap-3 px-4 py-3 sm:px-6">
                <span className="min-w-0 flex-1 text-sm text-slate-800">{m.content}<span className="block text-xs text-slate-400">{longDay(m.createdAt)}</span></span>
                <button type="button" onClick={() => void run(m.id, () => fapi("memory/delete", { id: m.id }))} aria-label="Olvidar" className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`${card} ${flat}`}>
        <CardHeader divider><SectionTitle icon={Wand2} tint="emerald" size="base">Reglas aprendidas</SectionTitle></CardHeader>
        {data.rules.length === 0 ? <p className="px-6 py-5 text-sm text-slate-500">Cuando corrijas un movimiento y lo apliques a los parecidos, la regla aparecerá aquí.</p> : (
          <ul className="divide-y divide-slate-100">
            {data.rules.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">«{r.pattern}»</span>
                  {r.label && <span className="block truncate text-xs text-slate-400">{r.label}</span>}
                </span>
                <Pill color="blue">{r.kind === "gasto" || r.kind === "devolucion" ? r.categoryLabel : KIND_LABEL[r.kind]}</Pill>
                {r.extraordinary && <Pill color="amber">Extraordinario</Pill>}
                <span className="text-xs text-slate-500">{r.hits} aplicados</span>
                <button type="button" onClick={() => void run(r.id, () => fapi("rule/delete", { id: r.id }))} aria-label="Borrar regla" className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
