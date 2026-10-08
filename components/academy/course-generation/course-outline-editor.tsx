// components/academy/course-generation/course-outline-editor.tsx
"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, ChevronDown, ChevronUp, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { saveCourseOutlineAction } from "@/app/actions/course-outline-review";
import type { CourseOutline } from "@/lib/academy/generation/course-outline";

type Module = CourseOutline["modules"][number];
type Props = {
  courseId: string;
  initialOutline: CourseOutline;
  onBack?: () => void;
  onSaved?: (outline: CourseOutline) => void;
  onRegenerate?: () => void;
};

export function CourseOutlineEditor({ courseId, initialOutline, onBack, onSaved, onRegenerate }: Props) {
  const [outline, setOutline] = useState<CourseOutline>(initialOutline);
  const [expanded, setExpanded] = useState<number | null>(0);
  const [saving, startSaving] = useTransition();
  const [dirty, setDirty] = useState(false);
  const total = outline.modules.reduce((sum, module) => sum + module.estimatedMinutes, 0);

  function update(modules: Module[]) {
    setOutline(current => ({ ...current, modules: modules.map((module, i) => ({ ...module, order: i + 1 })) }));
    setDirty(true);
  }
  function patch(index: number, changes: Partial<Module>) {
    update(outline.modules.map((module, i) => i === index ? { ...module, ...changes } : module));
  }
  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= outline.modules.length) return;
    const next = [...outline.modules];
    [next[index], next[target]] = [next[target], next[index]];
    update(next);
    setExpanded(target);
  }
  function add() {
    update([...outline.modules, { order: outline.modules.length + 1, title: "Nuevo módulo", description: "", learningObjectives: [""], estimatedMinutes: 30 }]);
    setExpanded(outline.modules.length);
  }
  function remove(index: number) {
    if (outline.modules.length <= 1) return toast.error("Debe quedar al menos un módulo.");
    update(outline.modules.filter((_, i) => i !== index));
    setExpanded(null);
  }
  function save() {
    startSaving(async () => {
      const result = await saveCourseOutlineAction(courseId, outline);
      if (!result.ok) return toast.error(result.error);
      setDirty(false);
      toast.success("Propuesta guardada. Pendiente de aprobación.");
      onSaved?.(outline);
    });
  }
  function back() {
    if (dirty && !window.confirm("Hay cambios sin guardar. ¿Quieres volver igualmente?")) return;
    onBack?.();
  }
  function regenerate() {
    if (!onRegenerate) return;
    if (dirty && !window.confirm("La regeneración reemplazará los cambios sin guardar. ¿Continuar?")) return;
    onRegenerate();
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-white text-slate-900">
      <header className="shrink-0 border-b border-slate-100 px-5 py-4">
        <p className="text-xs font-medium uppercase tracking-wide text-blue-600">Propuesta de temario</p>
        <h2 className="mt-1 text-lg font-semibold">{outline.title}</h2>
        <p className="mt-1 text-xs text-slate-500">{outline.modules.length} módulos · {Math.floor(total / 60)} h {total % 60} min · Pendiente de revisión</p>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {outline.modules.map((module, index) => (
          <section key={index} className="overflow-hidden rounded-xl border border-slate-200">
            <div className="flex items-center gap-2 px-3 py-3">
              <button type="button" onClick={() => setExpanded(expanded === index ? null : index)} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={expanded === index}>
                <span className="shrink-0 text-xs font-semibold text-blue-600">{index + 1}.</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{module.title || "Sin título"}</span>
                <span className="shrink-0 text-xs text-slate-400">{module.estimatedMinutes} min</span>
                {expanded === index ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
              </button>
              <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Subir módulo" className="disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
              <button type="button" onClick={() => move(index, 1)} disabled={index === outline.modules.length - 1} aria-label="Bajar módulo" className="disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
            </div>
            {expanded === index && (
              <div className="space-y-4 border-t border-slate-100 px-3 py-4">
                <label className="block space-y-1 text-xs font-medium text-slate-600">Título
                  <Input value={module.title} onChange={e => patch(index, { title: e.target.value })} className="mt-1" />
                </label>
                <label className="block space-y-1 text-xs font-medium text-slate-600">Descripción
                  <Textarea value={module.description} onChange={e => patch(index, { description: e.target.value })} rows={3} className="mt-1" />
                </label>
                <label className="block space-y-1 text-xs font-medium text-slate-600">Duración estimada (minutos)
                  <Input type="number" min={1} max={600} value={module.estimatedMinutes} onChange={e => patch(index, { estimatedMinutes: Number(e.target.value) })} className="mt-1" />
                </label>
                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-600">Objetivos de aprendizaje</p>
                  {module.learningObjectives.map((objective, objectiveIndex) => (
                    <div key={objectiveIndex} className="flex items-center gap-2">
                      <Input aria-label={`Objetivo ${objectiveIndex + 1}`} value={objective} onChange={e => patch(index, { learningObjectives: module.learningObjectives.map((v, i) => i === objectiveIndex ? e.target.value : v) })} />
                      <button type="button" aria-label="Eliminar objetivo" onClick={() => patch(index, { learningObjectives: module.learningObjectives.filter((_, i) => i !== objectiveIndex) })}><Trash2 className="h-4 w-4 text-slate-400" /></button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={() => patch(index, { learningObjectives: [...module.learningObjectives, ""] })}><Plus className="mr-1 h-3 w-3" /> Añadir objetivo</Button>
                </div>
                <div className="flex justify-end"><Button type="button" variant="ghost" size="sm" onClick={() => remove(index)} className="text-red-600"><Trash2 className="mr-1 h-4 w-4" /> Eliminar módulo</Button></div>
              </div>
            )}
          </section>
        ))}
        <Button type="button" variant="outline" onClick={add} className="w-full border-dashed"><Plus className="mr-2 h-4 w-4" /> Añadir módulo</Button>
        {onRegenerate && <Button type="button" variant="ghost" onClick={regenerate} className="w-full"><RotateCcw className="mr-2 h-4 w-4" /> Regenerar propuesta</Button>}
      </div>
      <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-100 px-5 py-4">
        {onBack ? <Button type="button" variant="outline" onClick={back}><ArrowLeft className="mr-2 h-4 w-4" /> Atrás</Button> : <span />}
        <Button type="button" disabled={saving} onClick={save} className="bg-[#315BFF] text-white hover:bg-[#244BE8]"><Save className="mr-2 h-4 w-4" /> {saving ? "Guardando..." : "Guardar propuesta"}</Button>
      </footer>
    </div>
  );
}
