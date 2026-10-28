"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { FilePlus2, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import { cn } from "@/lib/utils";

type Field = { key: string; label: string; type: "text" | "long_text" | "decimal" | "date" | "integer"; description: string; identity: boolean; required: boolean };
type Template = { nombre: string; descripcion: string; appliesTo: { familia: string; tipo: string; subtipo: string | null }; varios: boolean; campos: Field[];
  analitica: { sumar: boolean; categoria: string; importe: string | null; fecha: string | null; tercero: string | null } };
type Doc = { importId: string; importFileId: string; archivo: string; partes: number; estado: "pendiente" | "procesado" | "error" | "ignorado"; registros: number; error: string | null };
type Group = { familia: string; tipo: string; subtipo: string | null; label: string; documentos: Doc[]; plantilla: { id: string; nombre: string } | null };

const TYPES = [{ value: "text", label: "Texto" }, { value: "long_text", label: "Texto largo" }, { value: "decimal", label: "Importe / número" }, { value: "date", label: "Fecha" }, { value: "integer", label: "Número entero" }];
const CATEGORIES = [{ value: "personal", label: "Personal" }, { value: "impuestos", label: "Impuestos" }, { value: "alquiler", label: "Alquiler" }, { value: "suministros", label: "Suministros" },
  { value: "servicios", label: "Servicios" }, { value: "compras", label: "Compras" }, { value: "otros", label: "Otros" }];
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const keyOf = (label: string) => label.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "campo";

async function post(url: string, body: unknown) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.error ?? "No se pudo completar");
  return json;
}

/**
 * Documents imported without a table for their type (payslips, receipts, tax forms…): propose a table from them,
 * review it, and process the stored documents with it (nothing is uploaded again). Documents already processed by a
 * template show their progress.
 */
export function TemplateManager() {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Group | null>(null);
  const [running, setRunning] = useState<{ label: string; done: number; total: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/knowledge/intake/templates", { cache: "no-store" });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? "No se pudo leer");
      setGroups(json.grupos); setCanManage(json.canManage); setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  /** One by one (two at a time), so each request stays short; the list refreshes at the end. */
  const process = useCallback(async (templateId: string, label: string, docs: Doc[], ignore: Doc[] = []) => {
    setRunning({ label, done: 0, total: docs.length + ignore.length });
    let done = 0;
    for (const d of ignore) { await post(`/api/knowledge/intake/templates/${templateId}/documents`, { importId: d.importId, importFileId: d.importFileId, accion: "ignorar" }).catch(() => undefined); setRunning({ label, done: ++done, total: docs.length + ignore.length }); }
    const queue = [...docs];
    const worker = async () => {
      for (let d = queue.shift(); d; d = queue.shift()) {
        await post(`/api/knowledge/intake/templates/${templateId}/documents`, { importId: d.importId, importFileId: d.importFileId, accion: "procesar" }).catch(() => undefined);
        setRunning({ label, done: ++done, total: docs.length + ignore.length });
      }
    };
    await Promise.all([worker(), worker()]);
    setRunning(null);
    await load();
  }, [load]);

  // New documents of a type that already has a table go in on their own when this page is open (once per visit;
  // documents with an error are not retried automatically).
  const auto = useRef(false);
  useEffect(() => {
    if (!groups || !canManage || running || auto.current) return;
    auto.current = true;
    const todo = groups.filter(g => g.plantilla && g.documentos.some(d => d.estado === "pendiente"));
    void (async () => { for (const g of todo) await process(g.plantilla!.id, g.plantilla!.nombre, g.documentos.filter(d => d.estado === "pendiente")); })();
  }, [groups, canManage, running, process]);

  if (error) return <p className="rounded-xl bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</p>;
  if (!groups || !groups.length) return null;
  const waiting = groups.reduce((n, g) => n + g.documentos.filter(d => d.estado === "pendiente").length, 0);

  return <section className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-5 py-4">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><FilePlus2 className="size-4 text-[#0A58FF]" />Documentos sin tabla</h2>
        <p className="mt-0.5 text-xs text-slate-500">Tipos de documento que se importaron pero no guardan datos porque todavía no tienen tabla. Crea su tabla una vez: se procesan los ya importados y los nuevos que lleguen.</p>
      </div>
      {waiting > 0 && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">{plural(waiting, "documento pendiente", "documentos pendientes")}</span>}
    </div>
    {running && <p className="flex items-center gap-2 border-b border-slate-100 bg-blue-50/40 px-5 py-2 text-sm text-slate-700"><Loader2 className="size-4 animate-spin text-[#0A58FF]" />
      {running.label}: {running.done} de {running.total} documentos. Deja la página abierta.</p>}
    <ul className="divide-y divide-slate-100">{groups.map(g => {
      const count = (e: Doc["estado"]) => g.documentos.filter(d => d.estado === e).length;
      const pending = g.documentos.filter(d => d.estado === "pendiente" || d.estado === "error");
      return <li key={`${g.familia}|${g.tipo}|${g.subtipo}`} className="flex flex-wrap items-center gap-3 px-5 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-900">{g.plantilla ? g.plantilla.nombre : g.label}
            {g.plantilla && <span className="ml-2 text-xs font-normal text-slate-500">({g.label})</span>}</p>
          <p className="text-xs text-slate-500">{plural(g.documentos.length, "documento", "documentos")}
            {g.plantilla ? ` · ${count("procesado")} procesados (${g.documentos.reduce((n, d) => n + d.registros, 0)} registros)${count("pendiente") ? ` · ${count("pendiente")} pendientes` : ""}${count("error") ? ` · ${count("error")} con error` : ""}${count("ignorado") ? ` · ${count("ignorado")} sin guardar` : ""}`
              : `: ${g.documentos.slice(0, 3).map(d => d.archivo).join(", ")}${g.documentos.length > 3 ? "…" : ""}`}</p>
          {g.documentos.some(d => d.error) && <details className="text-[11px] text-rose-600"><summary className="cursor-pointer">Ver errores</summary>
            <ul className="mt-1 list-disc pl-5">{g.documentos.filter(d => d.error).map(d => <li key={d.importFileId}>{d.archivo}: {d.error}</li>)}</ul></details>}
        </div>
        {canManage && !g.plantilla && <Button variant="brand" size="sm" disabled={!!running} onClick={() => setEditing(g)}><Sparkles className="size-3.5" />Crear tabla</Button>}
        {canManage && g.plantilla && pending.length > 0 && <Button variant="outline" size="sm" disabled={!!running}
          onClick={() => void process(g.plantilla!.id, g.plantilla!.nombre, pending)}>Procesar {plural(pending.length, "pendiente", "pendientes")}</Button>}
      </li>;
    })}</ul>
    {editing && <TemplateDialog group={editing} onClose={() => setEditing(null)}
      onCreated={(id, nombre, docs, ignore) => { setEditing(null); void process(id, nombre, docs, ignore); }} />}
  </section>;
}

function TemplateDialog({ group, onClose, onCreated }: { group: Group; onClose: () => void; onCreated: (id: string, nombre: string, docs: Doc[], ignore: Doc[]) => void }) {
  const [t, setT] = useState<Template | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

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
      <div className="border-b border-slate-200 px-6 py-4">
        <DialogTitle className="text-base font-semibold text-slate-900">Nueva tabla para «{group.label}»</DialogTitle>
        <DialogDescription className="mt-0.5 text-xs text-slate-500">Propuesta a partir de tus documentos. Cambia lo que quieras: nombres, columnas, cuáles identifican cada registro y cómo suma en Analítica.</DialogDescription>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-4">
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        {!t ? !error && <p className="flex items-center gap-2 py-10 text-sm text-slate-500"><Loader2 className="size-4 animate-spin" />Leyendo tus documentos de este tipo para proponer la tabla…</p> : <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-medium text-slate-600">Nombre de la tabla
              <input value={t.nombre} onChange={e => set({ nombre: e.target.value })} className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal text-slate-900 outline-none focus:border-[#0A58FF]" /></label>
            <label className="space-y-1 text-xs font-medium text-slate-600">Descripción
              <input value={t.descripcion} onChange={e => set({ descripcion: e.target.value })} className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal text-slate-900 outline-none focus:border-[#0A58FF]" /></label>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" className="size-4 accent-[#0A58FF]" checked={t.varios} onChange={e => set({ varios: e.target.checked })} />
            Un documento puede traer varios registros (por ejemplo, las nóminas de toda la plantilla)</label>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Columnas</p>
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr>
                <th className="px-3 py-2 text-left font-semibold">Columna</th><th className="px-3 py-2 text-left font-semibold">Tipo</th>
                <th className="px-3 py-2 text-center font-semibold" title="Identifica un registro: evita guardarlo dos veces si aparece en dos documentos">Identifica</th><th className="w-8" /></tr></thead>
                <tbody>{t.campos.map((c, i) => <tr key={i} className="border-t border-slate-100">
                  <td className="px-3 py-1.5"><input value={c.label} title={c.description} onChange={e => setField(i, { label: e.target.value, key: keyOf(e.target.value) })}
                    className="h-8 w-full rounded-md border border-transparent px-2 hover:border-slate-200 focus:border-[#0A58FF] focus:outline-none" /></td>
                  <td className="px-3 py-1.5"><Combobox variant="ghost" className="h-8 w-40" value={c.type} options={TYPES} onChange={v => setField(i, { type: v as Field["type"] })} /></td>
                  <td className="px-3 py-1.5 text-center"><input type="checkbox" className="size-4 accent-[#0A58FF]" checked={c.identity} onChange={e => setField(i, { identity: e.target.checked })} /></td>
                  <td className="pr-2"><button type="button" aria-label="Quitar columna" onClick={() => set({ campos: t.campos.filter((_, j) => j !== i) })} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600"><Trash2 className="size-3.5" /></button></td>
                </tr>)}</tbody></table>
              <button type="button" onClick={() => set({ campos: [...t.campos, { key: `campo_${t.campos.length + 1}`, label: "Nueva columna", type: "text", description: "", identity: false, required: false }] })}
                className="flex w-full items-center gap-1.5 border-t border-slate-100 px-3 py-2 text-xs font-medium text-[#0A58FF] hover:bg-slate-50"><Plus className="size-3.5" />Añadir columna</button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-800"><input type="checkbox" className="size-4 accent-[#0A58FF]" checked={t.analitica.sumar}
              onChange={e => set({ analitica: { ...t.analitica, sumar: e.target.checked } })} />Sumar como gasto en Analítica</label>
            {t.analitica.sumar && <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {([["categoria", "Categoría", CATEGORIES], ["importe", "Importe que suma", fieldOptions(["decimal"])], ["fecha", "Fecha", fieldOptions(["date"])]] as const).map(([k, label, opts]) =>
                <label key={k} className="space-y-1 text-xs font-medium text-slate-600">{label}
                  <Combobox className="w-full" value={t.analitica[k]} options={[...opts]} placeholder="Elegir…" onChange={v => set({ analitica: { ...t.analitica, [k]: v } })} /></label>)}
            </div>}
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Documentos que se procesarán ({group.documentos.length - excluded.size})</p>
            <p className="mb-2 text-xs text-slate-500">Desmarca los que no sean de este tipo (por ejemplo, justificantes de pago de compras que ya tienen factura): no se guardan.</p>
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">{group.documentos.map(d => <li key={d.importFileId}>
              <label className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-slate-700 hover:bg-slate-50">
                <input type="checkbox" className="size-4 accent-[#0A58FF]" checked={!excluded.has(d.importFileId)}
                  onChange={e => setExcluded(prev => { const next = new Set(prev); if (e.target.checked) next.delete(d.importFileId); else next.add(d.importFileId); return next; })} />
                <span className="min-w-0 flex-1 truncate">{d.archivo}</span>{d.partes > 1 && <span className="text-xs text-slate-400">{d.partes} partes</span>}</label></li>)}</ul>
          </div>
        </>}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-6 py-3">
        <p className="text-xs text-slate-500">Se crea la tabla y se procesan los documentos marcados desde sus originales guardados.</p>
        <Button variant="brand" disabled={!t || saving || !t.campos.length} onClick={() => void create()}>
          {saving ? <><Loader2 className="size-4 animate-spin" />Creando…</> : `Crear tabla y procesar ${plural(group.documentos.length - excluded.size, "documento", "documentos")}`}</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
