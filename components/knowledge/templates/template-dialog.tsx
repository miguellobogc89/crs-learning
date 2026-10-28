"use client";
import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import { cn } from "@/lib/utils";

/** Shared pieces of the templates UI: types, the processing runner and the "new table" dialog. */
export type Field = { key: string; label: string; type: "text" | "long_text" | "decimal" | "date" | "integer"; description: string; identity: boolean; required: boolean };
export type Template = { nombre: string; descripcion: string; appliesTo: { familia: string; tipo: string; subtipo: string | null }; varios: boolean; campos: Field[];
  analitica: { sumar: boolean; categoria: string; importe: string | null; fecha: string | null; tercero: string | null } };
export type Doc = { importId: string; importFileId: string; archivo: string; partes: number; estado: "pendiente" | "procesado" | "error" | "ignorado"; registros: number; error: string | null };
export type Group = { familia: string; tipo: string; subtipo: string | null; label: string; documentos: Doc[]; plantilla: { id: string; nombre: string } | null };

const TYPES = [{ value: "text", label: "Texto" }, { value: "long_text", label: "Texto largo" }, { value: "decimal", label: "Importe o número" }, { value: "date", label: "Fecha" }, { value: "integer", label: "Número entero" }];
const CATEGORIES = [{ value: "personal", label: "Personal" }, { value: "impuestos", label: "Impuestos" }, { value: "alquiler", label: "Alquiler" }, { value: "suministros", label: "Suministros" },
  { value: "servicios", label: "Servicios" }, { value: "compras", label: "Compras" }, { value: "otros", label: "Otros" }];
export const plural = (n: number, one: string, many: string) => `${n.toLocaleString("es-ES")} ${n === 1 ? one : many}`;
const keyOf = (label: string) => label.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "campo";

export async function post(url: string, body: unknown) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.error ?? "No se pudo completar");
  return json;
}

export type Running = { label: string; done: number; total: number };
/** Processes stored documents with a template, two at a time (each request stays short). */
export function useTemplateRunner(onDone?: () => void | Promise<void>) {
  const [running, setRunning] = useState<Running | null>(null);
  const process = useCallback(async (templateId: string, label: string, docs: Doc[], ignore: Doc[] = []) => {
    const total = docs.length + ignore.length;
    let done = 0;
    setRunning({ label, done, total });
    const send = (d: Doc, accion: "procesar" | "ignorar") => post(`/api/knowledge/intake/templates/${templateId}/documents`, { importId: d.importId, importFileId: d.importFileId, accion })
      .catch(() => undefined).finally(() => setRunning({ label, done: ++done, total }));
    for (const d of ignore) await send(d, "ignorar");
    const queue = [...docs];
    const worker = async () => { for (let d = queue.shift(); d; d = queue.shift()) await send(d, "procesar"); };
    await Promise.all([worker(), worker()]);
    setRunning(null);
    await onDone?.();
  }, [onDone]);
  return { running, process };
}

export function ProgressBar({ running }: { running: Running }) {
  const pct = running.total ? Math.round(running.done / running.total * 100) : 0;
  return <div className="space-y-1.5">
    <div className="flex items-center justify-between text-xs text-slate-600">
      <span className="flex items-center gap-2"><Loader2 className="size-3.5 animate-spin text-[#0A58FF]" />{running.label}: procesando documentos…</span>
      <span className="tabular-nums">{running.done} / {running.total}</span>
    </div>
    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#0A58FF] transition-[width] duration-300" style={{ width: `${pct}%` }} /></div>
  </div>;
}

const label = "text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const input = "h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition-colors hover:border-slate-300 focus:border-[#0A58FF] focus:ring-3 focus:ring-[#0A58FF]/15";

/** Proposal → review → create. The documents can be left out one by one (e.g. payment receipts of invoiced purchases). */
export function TemplateDialog({ group, onClose, onCreated }: { group: Group; onClose: () => void; onCreated: (id: string, nombre: string, docs: Doc[], ignore: Doc[]) => void }) {
  const [t, setT] = useState<Template | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set(group.documentos.filter(d => d.estado === "ignorado").map(d => d.importFileId)));

  useEffect(() => {
    let cancelled = false;
    post("/api/knowledge/intake/templates/propose", { familia: group.familia, tipo: group.tipo, subtipo: group.subtipo })
      .then(json => { if (!cancelled) setT(json.plantilla); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [group]);

  const set = (patch: Partial<Template>) => setT(prev => prev ? { ...prev, ...patch } : prev);
  const setField = (i: number, patch: Partial<Field>) => set({ campos: t!.campos.map((c, j) => j === i ? { ...c, ...patch } : c) });
  const fieldOptions = (types: Field["type"][]) => t ? t.campos.filter(c => types.includes(c.type)).map(c => ({ value: c.key, label: c.label })) : [];
  const included = group.documentos.length - excluded.size;

  async function create() {
    if (!t) return;
    setSaving(true); setError(null);
    try {
      const json = await post("/api/knowledge/intake/templates", { plantilla: t });
      onCreated(json.id, t.nombre, group.documentos.filter(d => !excluded.has(d.importFileId)), group.documentos.filter(d => excluded.has(d.importFileId)));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setSaving(false); }
  }

  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
    <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
      <div className="flex items-start gap-3 border-b border-slate-200 px-6 py-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#0A58FF]/10 text-[#0A58FF]"><Sparkles className="size-5" /></span>
        <div className="min-w-0">
          <DialogTitle className="text-base font-semibold text-slate-900">Nueva tabla para «{group.label}»</DialogTitle>
          <DialogDescription className="mt-0.5 text-sm text-slate-500">Propuesta a partir de tus documentos. Ajusta nombres y columnas, marca qué identifica cada registro y cómo suma en Analítica.</DialogDescription>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto bg-slate-50/40 px-6 py-5">
        {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        {!t ? !error && <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
            <Loader2 className="size-6 animate-spin text-[#0A58FF]" />
            <p className="text-sm font-medium text-slate-700">Leyendo tus documentos de este tipo</p>
            <p className="max-w-sm text-xs text-slate-500">Se analizan hasta tres ejemplos para proponer las columnas. Tarda unos segundos.</p>
          </div> : <>
          <section className="space-y-3">
            <p className={label}>Tabla</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-xs font-medium text-slate-600">Nombre<input value={t.nombre} onChange={e => set({ nombre: e.target.value })} className={input} /></label>
              <label className="space-y-1.5 text-xs font-medium text-slate-600">Descripción<input value={t.descripcion} onChange={e => set({ descripcion: e.target.value })} className={input} /></label>
            </div>
            <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700">
              <input type="checkbox" className="mt-0.5 size-4 accent-[#0A58FF]" checked={t.varios} onChange={e => set({ varios: e.target.checked })} />
              <span>Un documento puede traer varios registros<span className="block text-xs text-slate-500">Por ejemplo, un PDF con las nóminas de toda la plantilla.</span></span></label>
          </section>

          <section className="space-y-3">
            <div className="flex items-baseline justify-between"><p className={label}>Columnas ({t.campos.length})</p>
              <p className="text-xs text-slate-500">«Identifica»: evita guardar dos veces el mismo registro.</p></div>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><tr>
                <th className="px-3 py-2 text-left font-semibold">Columna</th><th className="px-3 py-2 text-left font-semibold">Tipo de dato</th>
                <th className="px-3 py-2 text-center font-semibold">Identifica</th><th className="w-10" /></tr></thead>
                <tbody>{t.campos.map((c, i) => <tr key={i} className="group border-t border-slate-100 first:border-t-0">
                  <td className="px-2 py-1"><input value={c.label} title={c.description} onChange={e => setField(i, { label: e.target.value, key: keyOf(e.target.value) })}
                    className="h-8 w-full rounded-md border border-transparent px-2 text-slate-900 outline-none hover:border-slate-200 focus:border-[#0A58FF]" /></td>
                  <td className="px-2 py-1"><Combobox variant="ghost" className="h-8 w-44" value={c.type} options={TYPES} onChange={v => setField(i, { type: v as Field["type"] })} /></td>
                  <td className="px-3 py-1 text-center"><input type="checkbox" className="size-4 accent-[#0A58FF]" checked={c.identity} onChange={e => setField(i, { identity: e.target.checked })} /></td>
                  <td className="pr-2 text-right"><button type="button" aria-label={`Quitar ${c.label}`} onClick={() => set({ campos: t.campos.filter((_, j) => j !== i) })}
                    className="rounded-md p-1.5 text-slate-300 opacity-0 transition-opacity hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100 focus:opacity-100"><Trash2 className="size-3.5" /></button></td>
                </tr>)}</tbody></table>
              <button type="button" onClick={() => set({ campos: [...t.campos, { key: `campo_${t.campos.length + 1}`, label: "Nueva columna", type: "text", description: "", identity: false, required: false }] })}
                className="flex w-full items-center gap-1.5 border-t border-slate-100 px-4 py-2.5 text-xs font-medium text-[#0A58FF] hover:bg-slate-50"><Plus className="size-3.5" />Añadir columna</button>
            </div>
          </section>

          <section className="space-y-3">
            <p className={label}>Analítica</p>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <label className="flex items-start gap-2.5 text-sm text-slate-700"><input type="checkbox" className="mt-0.5 size-4 accent-[#0A58FF]" checked={t.analitica.sumar}
                onChange={e => set({ analitica: { ...t.analitica, sumar: e.target.checked } })} />
                <span><span className="font-medium text-slate-900">Sumar como gasto</span><span className="block text-xs text-slate-500">Entra en los paneles con su categoría (Personal, Alquiler, Impuestos…).</span></span></label>
              {t.analitica.sumar && <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {([["categoria", "Categoría", CATEGORIES], ["importe", "Importe que suma", fieldOptions(["decimal"])], ["fecha", "Fecha", fieldOptions(["date"])]] as const).map(([k, l, opts]) =>
                  <label key={k} className="space-y-1.5 text-xs font-medium text-slate-600">{l}
                    <Combobox className="h-9 w-full" value={t.analitica[k]} options={[...opts]} placeholder="Elegir…" onChange={v => set({ analitica: { ...t.analitica, [k]: v } })} /></label>)}
              </div>}
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-baseline justify-between"><p className={label}>Documentos ({included} de {group.documentos.length})</p>
              <p className="text-xs text-slate-500">Desmarca los que no sean de este tipo: no se guardan.</p></div>
            <ul className="max-h-52 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 bg-white">{group.documentos.map(d => {
              const on = !excluded.has(d.importFileId);
              return <li key={d.importFileId}><label className={cn("flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50", !on && "text-slate-400")}>
                <input type="checkbox" className="size-4 accent-[#0A58FF]" checked={on}
                  onChange={e => setExcluded(prev => { const next = new Set(prev); if (e.target.checked) next.delete(d.importFileId); else next.add(d.importFileId); return next; })} />
                <span className="min-w-0 flex-1 truncate">{d.archivo}</span>
                {d.partes > 1 && <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">{d.partes} partes</span>}</label></li>;
            })}</ul>
          </section>
        </>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-6 py-4">
        <p className="flex items-center gap-1.5 text-xs text-slate-500"><Check className="size-3.5 text-emerald-600" />Se procesan desde los originales ya importados: no hay que subir nada.</p>
        <div className="flex gap-2">
          <Button variant="ghost" disabled={saving} onClick={onClose}>Cancelar</Button>
          <Button variant="corporate" disabled={!t || saving || !t.campos.length || !included} onClick={() => void create()}>
            {saving ? <><Loader2 className="size-4 animate-spin" />Creando…</> : `Crear tabla y procesar ${plural(included, "documento", "documentos")}`}</Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}
