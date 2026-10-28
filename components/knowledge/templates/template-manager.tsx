"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight, FileQuestion, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { plural, ProgressBar, TemplateDialog, useTemplateRunner, type Group } from "./template-dialog";

/**
 * Documents imported without a table for their type (payslips, receipts, tax forms…), as a compact card: each type
 * with how many documents it has, "Crear tabla" to propose one, and the progress of the types that already have a
 * table. New documents of those types are processed on their own while the page is open.
 */
export function TemplateManager() {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Group | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/knowledge/intake/templates", { cache: "no-store" });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? "No se pudo leer");
      setGroups(json.grupos); setCanManage(json.canManage); setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const { running, process } = useTemplateRunner(load);

  // New documents of a type that already has a table go in on their own (once per visit; errors are not retried).
  const auto = useRef(false);
  useEffect(() => {
    if (!groups || !canManage || running || auto.current) return;
    auto.current = true;
    const todo = groups.filter(g => g.plantilla && g.documentos.some(d => d.estado === "pendiente"));
    void (async () => { for (const g of todo) await process(g.plantilla!.id, g.plantilla!.nombre, g.documentos.filter(d => d.estado === "pendiente")); })();
  }, [groups, canManage, running, process]);

  if (error) return <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</p>;
  const missing = (groups ?? []).filter(g => !g.plantilla && g.documentos.some(d => d.estado !== "ignorado"));
  const busy = (groups ?? []).filter(g => g.plantilla && g.documentos.some(d => d.estado === "pendiente" || d.estado === "error"));
  if (!missing.length && !busy.length && !running) return null;

  return <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
    <header className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4">
      <span className="flex size-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><FileQuestion className="size-[18px]" /></span>
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold text-slate-900">Documentos sin tabla</h2>
        <p className="text-xs text-slate-500">Se importaron pero no guardan datos porque su tipo todavía no tiene tabla.</p>
      </div>
      <Link href="/analytics?view=tablas" className="inline-flex items-center gap-1 text-xs font-medium text-[#0A58FF] hover:underline">Ver en Analítica<ChevronRight className="size-3.5" /></Link>
    </header>
    {running && <div className="border-b border-slate-100 px-5 py-3"><ProgressBar running={running} /></div>}
    <ul className="divide-y divide-slate-100">
      {missing.map(g => {
        const docs = g.documentos.filter(d => d.estado !== "ignorado");
        return <li key={`${g.familia}|${g.tipo}|${g.subtipo}`} className="flex flex-wrap items-center gap-3 px-5 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-900">{g.label}</p>
            <p className="truncate text-xs text-slate-500">{docs.slice(0, 3).map(d => d.archivo).join(" · ")}{docs.length > 3 ? ` · y ${docs.length - 3} más` : ""}</p>
          </div>
          <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium tabular-nums text-amber-700">{plural(docs.length, "documento", "documentos")}</span>
          {canManage && <Button variant="corporate" size="sm" disabled={!!running} onClick={() => setEditing(g)}><Sparkles className="size-3.5" />Crear tabla</Button>}
        </li>;
      })}
      {busy.map(g => {
        const pending = g.documentos.filter(d => d.estado === "pendiente" || d.estado === "error");
        const failed = g.documentos.filter(d => d.estado === "error");
        return <li key={g.plantilla!.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-900">{g.plantilla!.nombre}</p>
            <p className="text-xs text-slate-500">{plural(pending.length, "documento por procesar", "documentos por procesar")}{failed.length ? ` · ${failed.length} con error` : ""}</p>
          </div>
          {canManage && <Button variant="outline" size="sm" disabled={!!running} onClick={() => void process(g.plantilla!.id, g.plantilla!.nombre, pending)}>Procesar</Button>}
        </li>;
      })}
    </ul>
    {editing && <TemplateDialog group={editing} onClose={() => setEditing(null)}
      onCreated={(id, nombre, docs, ignore) => { setEditing(null); void process(id, nombre, docs, ignore); }} />}
  </section>;
}
