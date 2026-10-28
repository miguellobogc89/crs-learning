"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { plural, ProgressBar, useTemplateRunner, type Group } from "./template-dialog";

/**
 * Above a table made from a template, only when there is something to say: new documents of its type are processed
 * on their own when the table opens (with their progress), and documents that failed can be retried.
 */
export function TemplateTableStatus({ group, canEdit }: { group: Group; canEdit: boolean }) {
  const router = useRouter();
  const { running, process } = useTemplateRunner(() => router.refresh());
  const template = group.plantilla!;
  const pending = group.documentos.filter(d => d.estado === "pendiente");
  const failed = group.documentos.filter(d => d.estado === "error");
  const auto = useRef(false);
  useEffect(() => {
    if (!canEdit || auto.current || !pending.length) return;
    auto.current = true;
    void process(template.id, template.nombre, pending);
  }, [canEdit, pending, process, template]);

  if (running) return <div className="rounded-2xl border border-slate-200/80 bg-white px-5 py-3"><ProgressBar running={running} /></div>;
  if (!failed.length) return null;
  return <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-rose-200/80 bg-white px-5 py-3 text-sm">
    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600"><AlertTriangle className="size-4" /></span>
    <div className="min-w-0 flex-1">
      <p className="font-medium text-slate-900">{plural(failed.length, "documento no se pudo procesar", "documentos no se pudieron procesar")}</p>
      <p className="truncate text-xs text-slate-500" title={failed.map(d => `${d.archivo}: ${d.error ?? ""}`).join("\n")}>{failed.map(d => d.archivo).join(" · ")}</p>
    </div>
    {canEdit && <Button variant="outline" size="sm" onClick={() => void process(template.id, template.nombre, [...pending, ...failed])}>Reintentar</Button>}
  </div>;
}
