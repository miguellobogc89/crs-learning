"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, FileQuestion, FileText, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ProgressBar, TemplateDialog, useTemplateRunner, type Group } from "./template-dialog";

/**
 * Analítica → Sin tabla → a document type: what was imported, why it keeps no data, and "Crear tabla". Once created
 * and processed, the type becomes one more table (the page moves to it).
 */
export function UnsupportedTypeView({ group, canEdit }: { group: Group; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState<string | null>(null);
  const { running, process } = useTemplateRunner(() => { if (target) router.push(`/analytics?view=tablas&table=${encodeURIComponent(target)}`); router.refresh(); });
  const docs = group.documentos;
  const kept = docs.filter(d => d.estado !== "ignorado");
  const parts = kept.reduce((n, d) => n + d.partes, 0);

  return <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
    <header className="flex flex-wrap items-start gap-4 border-b border-slate-100 px-6 py-5">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><FileQuestion className="size-5" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Sin tabla</p>
        <h2 className="mt-0.5 text-lg font-semibold text-slate-900">{group.label}</h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">Estos documentos se importaron y se leyeron, pero no guardan datos porque su tipo todavía no tiene tabla. Crea la tabla una vez y se procesarán todos, también los que lleguen después.</p>
      </div>
      {canEdit && <Button variant="corporate" disabled={!!running || !kept.length} onClick={() => setEditing(true)}><Sparkles className="size-4" />Crear tabla</Button>}
    </header>

    <dl className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">
      {[["Documentos", kept.length], ["Partes de este tipo", parts], ["Excluidos", docs.length - kept.length]].map(([k, v]) =>
        <div key={k as string} className="px-6 py-4"><dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{k}</dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{(v as number).toLocaleString("es-ES")}</dd></div>)}
    </dl>

    {running && <div className="border-b border-slate-100 px-6 py-4"><ProgressBar running={running} /></div>}

    <div className="grid gap-3 border-b border-slate-100 bg-slate-50/50 px-6 py-4 sm:grid-cols-3">
      {["Se propone una tabla con columnas a partir de tus documentos.", "La revisas: nombres, columnas, qué identifica cada registro y cómo suma.", "Se procesan desde los originales ya importados y la tabla aparece en Tablas."].map((text, i) =>
        <div key={i} className="flex items-start gap-2.5 text-xs text-slate-600">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#0A58FF] text-[11px] font-semibold text-white">{i + 1}</span>{text}</div>)}
    </div>

    <table className="w-full text-sm">
      <thead className="bg-slate-50 text-xs text-slate-500"><tr>
        <th className="px-6 py-2.5 text-left font-semibold">Documento</th><th className="px-4 py-2.5 text-right font-semibold">Partes</th>
        <th className="px-4 py-2.5 text-left font-semibold">Estado</th><th className="px-6 py-2.5" /></tr></thead>
      <tbody>{docs.map(d => <tr key={d.importFileId} className="border-t border-slate-100 hover:bg-slate-50/60">
        <td className="max-w-0 px-6 py-2.5"><span className="flex items-center gap-2 truncate text-slate-800"><FileText className="size-4 shrink-0 text-slate-400" /><span className="truncate">{d.archivo}</span></span></td>
        <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{d.partes}</td>
        <td className="px-4 py-2.5"><span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", d.estado === "ignorado" ? "bg-slate-100 text-slate-500" : "bg-amber-50 text-amber-700")}>
          {d.estado === "ignorado" ? "Excluido" : "Sin guardar"}</span></td>
        <td className="px-6 py-2.5 text-right"><a href={`/api/knowledge/intake/files/${d.importFileId}`} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-[#0A58FF] hover:underline">Ver<ArrowRight className="size-3" /></a></td>
      </tr>)}</tbody>
    </table>

    {editing && <TemplateDialog group={group} onClose={() => setEditing(false)}
      onCreated={(id, nombre, toDo, ignore) => { setEditing(false); setTarget(`plantilla:${id}`); void process(id, nombre, toDo, ignore); }} />}
  </section>;
}
