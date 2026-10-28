"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { plural, ProgressBar, useTemplateRunner, type Group } from "./template-dialog";

/**
 * Above a table made from a template: from how many documents it comes, and the ones still to process (processed
 * on their own when the table is opened) or that failed (retried on request).
 */
export function TemplateTableBar({ group, canEdit }: { group: Group; canEdit: boolean }) {
  const router = useRouter();
  const { running, process } = useTemplateRunner(() => router.refresh());
  const template = group.plantilla!;
  const done = group.documentos.filter(d => d.estado === "procesado");
  const pending = group.documentos.filter(d => d.estado === "pendiente");
  const failed = group.documentos.filter(d => d.estado === "error");
  const auto = useRef(false);
  useEffect(() => {
    if (!canEdit || auto.current || !pending.length) return;
    auto.current = true;
    void process(template.id, template.nombre, pending);
  }, [canEdit, pending, process, template]);

  return <div className="rounded-2xl border border-slate-200/80 bg-white px-5 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
    {running ? <ProgressBar running={running} /> : <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-600">
      <span className="flex items-center gap-1.5"><Layers className="size-3.5 text-[#0A58FF]" />Creada a partir de {plural(group.documentos.filter(d => d.estado !== "ignorado").length, "documento", "documentos")} de tipo «{group.label}»</span>
      <span className="flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-emerald-600" />{plural(done.length, "procesado", "procesados")} · {plural(done.reduce((n, d) => n + d.registros, 0), "registro", "registros")}</span>
      {failed.length > 0 && <span className="flex items-center gap-1.5 text-rose-700" title={failed.map(d => `${d.archivo}: ${d.error ?? ""}`).join("\n")}>
        <AlertTriangle className="size-3.5" />{plural(failed.length, "con error", "con error")}</span>}
      {canEdit && (failed.length + pending.length) > 0 && <Button variant="outline" size="sm" className="ml-auto"
        onClick={() => void process(template.id, template.nombre, [...pending, ...failed])}>Procesar {plural(failed.length + pending.length, "documento", "documentos")}</Button>}
    </div>}
  </div>;
}
