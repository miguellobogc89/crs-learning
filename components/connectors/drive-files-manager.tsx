"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KnowledgeImportModal } from "@/components/knowledge/import/modal";
import { advanceIntake, PHASE_NAMES } from "@/components/knowledge/import/advance-intake";
import { intakeRequest } from "@/components/knowledge/import/intake-request";
import { cn } from "@/lib/utils";
import { IntakeQueue, saveClean, type QueueItem } from "./intake-queue";

type FileStatus = "sin_traer" | "procesando" | "por_guardar" | "guardado" | "error" | "repetido" | "no_legible";
type Row = { id: string; nombre: string; modificado: string | null; tamano: number | null; estado: FileStatus; fase: string | null; detalle: string | null; loteId: string | null; traido: string | null };
type Data = { carpeta: string; archivos: Row[]; recuento: Record<FileStatus, number>; listaIncompleta: boolean; canManage: boolean };

const GROUP = 20;
const LABEL: Record<FileStatus, string> = { sin_traer: "Sin traer", procesando: "En proceso", por_guardar: "Por guardar", guardado: "Guardado", error: "Con error", repetido: "Repetido", no_legible: "No legible" };
const CHIP: Record<FileStatus, string> = {
  sin_traer: "bg-slate-100 text-slate-600", procesando: "bg-blue-50 text-[#0A58FF]", por_guardar: "bg-amber-50 text-amber-700",
  guardado: "bg-emerald-50 text-emerald-700", error: "bg-rose-50 text-rose-700", repetido: "bg-slate-50 text-slate-500", no_legible: "bg-slate-50 text-slate-500",
};
const FILTERS: (FileStatus | "todos")[] = ["todos", "sin_traer", "procesando", "por_guardar", "guardado", "error", "repetido", "no_legible"];
const day = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const chunks = <T,>(items: T[], size: number) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));

/**
 * Every document of the Drive folder with its status; choose and queue them. The queue processes the batches while
 * this page is open (2 at a time) and stops each one before saving. "Guardar los que no tienen dudas" saves in one go.
 */
export function DriveFilesManager({ libraryId }: { libraryId: string | null }) {
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FileStatus | "todos">("todos");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [queue, setQueue] = useState<Map<string, QueueItem>>(new Map());
  const [bringing, setBringing] = useState<{ done: number; total: number } | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [confirmSave, setConfirmSave] = useState(false);
  const [saving, setSaving] = useState<{ done: number; total: number } | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const runner = useRef<IntakeQueue | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/connectors/google-drive/files", { cache: "no-store" });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? "No se pudo leer la carpeta");
      setData(json); setLoadError(null);
      return json as Data;
    } catch (e) { setLoadError(e instanceof Error ? e.message : String(e)); return null; }
  }, []);

  useEffect(() => {
    const q = new IntakeQueue({
      advance: id => advanceIntake(id, intakeRequest, { start: true }),
      onUpdate: item => setQueue(prev => new Map(prev).set(item.id, item)),
      onIdle: () => { void load(); },
    });
    runner.current = q;
    // Batches already on their way (e.g. from another computer or a closed tab) continue as soon as the page opens.
    void load().then(d => { if (d?.canManage) q.add([...new Set(d.archivos.filter(a => a.estado === "procesando" && a.loteId).map(a => a.loteId!))]); });
    const timer = setInterval(() => { if (q.busy) void load(); }, 15000);
    return () => { q.stop(); clearInterval(timer); };
  }, [load]);

  const rows = useMemo(() => (data?.archivos ?? []).map(r => {
    const live = r.loteId ? queue.get(r.loteId) : undefined;
    // The queue knows sooner than the last listing.
    if (!live || live.status === "en_cola") return r;
    const estado: FileStatus = live.status === "procesando" ? "procesando" : live.status;
    return { ...r, estado, fase: live.phase || r.fase, detalle: live.error ?? (estado === r.estado ? r.detalle : null) };
  }), [data, queue]);
  const counts = useMemo(() => {
    const c = { sin_traer: 0, procesando: 0, por_guardar: 0, guardado: 0, error: 0, repetido: 0, no_legible: 0 } as Record<FileStatus, number>;
    for (const r of rows) c[r.estado]++;
    return c;
  }, [rows]);
  const visible = filter === "todos" ? rows : rows.filter(r => r.estado === filter);
  const notBrought = rows.filter(r => r.estado === "sin_traer").map(r => r.id);
  const toSave = [...new Set(rows.filter(r => r.estado === "por_guardar" && r.loteId).map(r => r.loteId!))];
  const canManage = data?.canManage ?? false;

  function toggle(id: string) { setSelected(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }

  async function enqueue() {
    const ids = notBrought.filter(id => selected.has(id));
    if (!ids.length) return;
    const groups = chunks(ids, GROUP);
    setBringing({ done: 0, total: groups.length }); setNotice(null);
    let brought = 0, repeated = 0, unreadable = 0;
    try {
      for (const [i, group] of groups.entries()) {
        const r = await fetch("/api/connectors/google-drive/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fileIds: group, limit: GROUP }) });
        const json = await r.json();
        if (!r.ok) throw new Error(json.error ?? "No se pudo traer de Drive");
        brought += json.importados; repeated += json.duplicados; unreadable += json.omitidos.length;
        if (json.loteId) runner.current?.add([json.loteId]);
        setBringing({ done: i + 1, total: groups.length });
        await load();
      }
      setSelected(new Set());
      setNotice({ kind: "ok", text: `${plural(brought, "documento traído", "documentos traídos")} y en cola` + (repeated ? ` · ${plural(repeated, "ya estaba", "ya estaban")} importado${repeated === 1 ? "" : "s"}` : "") +
        (unreadable ? ` · ${plural(unreadable, "no se puede leer", "no se pueden leer")}` : "") + ". Deja esta página abierta mientras se procesan." });
    } catch (e) { setNotice({ kind: "error", text: e instanceof Error ? e.message : String(e) }); }
    finally { setBringing(null); }
  }

  async function resume(loteId: string) {
    try {
      await advanceIntake(loteId, intakeRequest, { start: true, retry: true });
      runner.current?.forget(loteId); runner.current?.add([loteId]);
    } catch (e) { setNotice({ kind: "error", text: e instanceof Error ? e.message : String(e) }); }
  }

  async function saveAll() {
    setConfirmSave(false); setSaving({ done: 0, total: toSave.length }); setNotice(null);
    const out = await saveClean(toSave, async (url, init) => { const r = await fetch(url, { cache: "no-store", ...init }); return { ok: r.ok, json: await r.json().catch(() => ({})) }; },
      done => setSaving({ done, total: toSave.length }));
    setSaving(null);
    await load();
    setNotice({ kind: out.errores.length ? "error" : "ok", text: `${plural(out.guardados.length, "lote guardado", "lotes guardados")}` +
      (out.conDudas.length ? ` · ${plural(out.conDudas.length, "lote necesita", "lotes necesitan")} tu decisión (ábrelos con «Revisar»)` : "") +
      (out.errores.length ? ` · ${plural(out.errores.length, "con error", "con error")}: ${out.errores.map(e => e.error).join(" · ")}` : "") });
  }

  if (loadError && !data) return <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{loadError}</p>;
  if (!data) return <p className="flex items-center gap-2 py-10 text-sm text-slate-500"><Loader2 className="size-4 animate-spin" />Leyendo la carpeta de Drive…</p>;
  const running = [...queue.values()].filter(q => q.status === "procesando" || q.status === "en_cola").length;

  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-4">
      {([["sin_traer", "Sin traer"], ["procesando", "En proceso"], ["por_guardar", "Por guardar"], ["guardado", "Guardados"]] as [FileStatus, string][]).map(([k, label]) =>
        <button key={k} type="button" onClick={() => setFilter(k)} className={cn("rounded-xl border bg-white px-4 py-3 text-left", filter === k ? "border-[#0A58FF]" : "border-slate-200 hover:border-slate-300")}>
          <p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-0.5 text-2xl font-semibold tabular-nums text-slate-900">{counts[k]}</p></button>)}
    </div>

    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="min-w-0 flex-1 text-sm text-slate-600">
        {bringing ? <span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" />Trayendo de Drive: grupo {Math.min(bringing.done + 1, bringing.total)} de {bringing.total}…</span>
          : saving ? <span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" />Guardando: {saving.done} de {saving.total} lotes…</span>
          : running ? <span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin text-[#0A58FF]" />{plural(running, "lote procesándose", "lotes procesándose")}. Deja esta página abierta.</span>
          : selected.size ? `${plural(selected.size, "documento seleccionado", "documentos seleccionados")} (se traen en grupos de ${GROUP})`
          : "Marca los documentos que quieras traer, o selecciónalos todos."}
      </p>
      {canManage && notBrought.length > 0 && <Button variant="outline" size="sm" disabled={!!bringing} onClick={() => setSelected(new Set(notBrought))}>Seleccionar los {notBrought.length} sin traer</Button>}
      {canManage && <Button variant="brand" size="sm" disabled={!!bringing || !selected.size} onClick={enqueue}>Traer y procesar ({selected.size})</Button>}
      {canManage && toSave.length > 0 && (confirmSave
        ? <><span className="text-xs text-slate-600">Se guardarán los lotes sin decisiones pendientes. ¿Seguro?</span>
            <Button variant="brand" size="sm" onClick={saveAll}>Sí, guardar</Button><Button variant="ghost" size="sm" onClick={() => setConfirmSave(false)}>Cancelar</Button></>
        : <Button variant="outline" size="sm" disabled={!!saving || !!bringing} onClick={() => setConfirmSave(true)}>Guardar los que no tienen dudas ({plural(toSave.length, "lote", "lotes")})</Button>)}
      <Button variant="ghost" size="sm" onClick={() => void load()} aria-label="Actualizar"><RefreshCw className="size-3.5" /></Button>
    </div>
    {notice && <p className={cn("rounded-lg px-4 py-2 text-sm", notice.kind === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700")}>{notice.text}</p>}
    {data.listaIncompleta && <p className="text-xs text-amber-700">La carpeta tiene más documentos de los que se muestran (máximo 2000).</p>}

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap gap-1 border-b border-slate-200 px-3 py-2">
        {FILTERS.map(f => <button key={f} type="button" onClick={() => setFilter(f)}
          className={cn("rounded-lg px-2.5 py-1 text-xs font-medium", filter === f ? "bg-[#EDF3FF] text-[#0A58FF]" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800")}>
          {f === "todos" ? `Todos (${rows.length})` : `${LABEL[f]} (${counts[f]})`}</button>)}
      </div>
      <div className="max-h-[60vh] overflow-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-xs text-slate-500"><tr>
            <th className="w-10 px-3 py-2.5">{canManage && <input type="checkbox" aria-label="Seleccionar los visibles sin traer"
              checked={visible.some(r => r.estado === "sin_traer") && visible.filter(r => r.estado === "sin_traer").every(r => selected.has(r.id))}
              onChange={e => setSelected(prev => { const next = new Set(prev); for (const r of visible.filter(x => x.estado === "sin_traer")) { if (e.target.checked) next.add(r.id); else next.delete(r.id); } return next; })} />}</th>
            <th className="px-3 py-2.5 font-semibold">Documento</th><th className="whitespace-nowrap px-3 py-2.5 font-semibold">Modificado en Drive</th>
            <th className="px-3 py-2.5 font-semibold">Estado</th><th className="px-3 py-2.5 font-semibold">Detalle</th><th className="px-3 py-2.5" />
          </tr></thead>
          <tbody>{visible.map(r => <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/60">
            <td className="px-3 py-2">{canManage && r.estado === "sin_traer" && <input type="checkbox" aria-label={`Seleccionar ${r.nombre}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} />}</td>
            <td className="max-w-[320px] truncate px-3 py-2 text-slate-800" title={r.nombre}>{r.nombre}</td>
            <td className="whitespace-nowrap px-3 py-2 text-slate-500">{day(r.modificado)}</td>
            <td className="px-3 py-2"><span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium", CHIP[r.estado])}>
              {r.estado === "procesando" && r.fase ? `${LABEL.procesando} · ${PHASE_NAMES[r.fase] ?? r.fase}` : LABEL[r.estado]}</span></td>
            <td className="max-w-[300px] truncate px-3 py-2 text-xs text-slate-500" title={r.detalle ?? ""}>{r.detalle ?? (r.loteId ? `Lote ${r.loteId.slice(0, 8)}` : "")}</td>
            <td className="whitespace-nowrap px-3 py-2 text-right">
              {canManage && r.loteId && (r.estado === "por_guardar" || r.estado === "guardado") && <button type="button" className="text-xs font-medium text-[#0A58FF] hover:underline" onClick={() => setOpened(r.loteId)}>{r.estado === "por_guardar" ? "Revisar" : "Ver"}</button>}
              {canManage && r.loteId && r.estado === "error" && (r.fase === "lectura"
                ? <button type="button" className="text-xs font-medium text-[#0A58FF] hover:underline" onClick={() => void resume(r.loteId!)}>Continuar</button>
                : <button type="button" className="text-xs font-medium text-[#0A58FF] hover:underline" onClick={() => setOpened(r.loteId)}>Ver</button>)}
            </td>
          </tr>)}
          {!visible.length && <tr><td colSpan={6} className="px-3 py-10 text-center text-sm text-slate-500">No hay documentos en este estado.</td></tr>}</tbody>
        </table>
      </div>
    </section>
    {opened && libraryId && <KnowledgeImportModal open stepwise resumeImportId={opened} context={{ origin: "root", libraryId }}
      onOpenChange={(next: boolean) => { if (!next) { setOpened(null); void load(); } }} />}
  </div>;
}
