"use client";
// components/academy/learning-room/didactic-activity.tsx
import { useState, type DragEvent } from "react";
import { Check, CheckCircle2, CircleHelp, GripVertical, RotateCcw, X } from "lucide-react";
import type { DidacticActivity as Activity } from "@/lib/academy/didactic-package";
type Props = { activity: Activity; value: string; onChange: (value: string) => void; reviewed: boolean; onReview: () => void };
export function DidacticActivity({ activity, value, onChange, reviewed, onReview }: Props) {
  const [hints, setHints] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const isChoice = (activity.kind === "quiz" || activity.kind === "decision") && (activity.options?.length ?? 0) >= 2;
  const isSorting = activity.kind === "sorting" && (activity.groups?.length ?? 0) >= 2 && (activity.sortItems?.length ?? 0) >= 2;
  const selected = activity.options?.find(o => o.id === value);
  const maxAttempts = Math.max(1, activity.maxAttempts);
  const remaining = Math.max(0, maxAttempts - attempts);
  const items = activity.sortItems ?? [];
  const groups = activity.groups ?? [];
  const score = items.filter(i => assignments[i.id] === i.groupId).length;
  const assignedCount = items.filter(i => !!assignments[i.id]).length;
  function confirmChoice() { if (!selected || confirmed) return; setConfirmed(true); setAttempts(p => p + 1); onReview(); }
  function assign(groupId: string, itemId: string | null) { if (!itemId || checked) return; setAssignments(p => ({ ...p, [itemId]: groupId })); setPicked(null); }
  function drop(e: DragEvent, groupId: string) { e.preventDefault(); assign(groupId, e.dataTransfer.getData("text/plain") || picked); }
  function verifySorting() { if (assignedCount !== items.length) return; setChecked(true); onReview(); }
  return <section className="rounded-[28px] border border-[#E7E6F1] bg-white p-5 shadow-sm sm:p-7">
    <div className="mb-4 flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F0EAF9] text-[#7C64B6]"><CircleHelp className="h-6 w-6"/></div><div><p className="text-xs font-bold uppercase tracking-wider text-[#8C79B5]">Microejercicio</p><h3 className="font-bold">Ponlo en práctica</h3></div></div>
    {activity.scenario && <p className="mb-4 rounded-xl bg-[#F5F2FB] p-4 text-sm leading-7 text-slate-700">{activity.scenario}</p>}
    <p className="mb-5 text-base font-semibold leading-7">{activity.instruction}</p>
    {isChoice ? <>
      <div className="grid gap-3 sm:grid-cols-2">{activity.options?.map((o, i) => <button type="button" key={o.id} disabled={confirmed} onClick={() => onChange(o.id)} className={`min-h-[100px] rounded-2xl border-2 p-4 text-left transition ${value === o.id ? "border-[#7767BD] bg-[#F0EDFA]" : "border-[#E7E6F1] bg-[#FAFAFC] hover:border-[#B8A9DB]"}`}><span className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs font-bold text-[#7365B2]">{String.fromCharCode(65 + i)}</span><span className="text-sm font-medium leading-6">{o.label}</span></button>)}</div>
      {!confirmed ? <button type="button" disabled={!selected} onClick={confirmChoice} className="mt-5 rounded-xl bg-[#7566B8] px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">Comprobar respuesta</button> : selected && <div className={`mt-5 rounded-2xl p-5 ${selected.isPreferred ? "bg-[#E7F5EE]" : "bg-[#FFF4E7]"}`}><p className="flex items-center gap-2 font-bold">{selected.isPreferred ? <CheckCircle2 className="h-5 w-5 text-emerald-600"/> : <CircleHelp className="h-5 w-5 text-amber-600"/>}{selected.isPreferred ? "¡Bien resuelto!" : "Veamos qué ocurre"}</p><p className="mt-3 text-sm leading-7">{selected.consequence}</p><p className="mt-2 text-sm leading-7 text-slate-600">{selected.feedback}</p>{!selected.isPreferred && remaining > 0 && <button type="button" className="mt-4 flex items-center gap-2 text-sm font-semibold text-[#6F5EB2]" onClick={() => { setConfirmed(false); onChange(""); }}><RotateCcw className="h-4 w-4"/> Reintentar ({remaining} restantes)</button>}</div>}
    </> : isSorting ? <>
      <p className="mb-4 text-xs text-slate-500">Arrastra una tarjeta a su categoría o tócala y después selecciona la categoría.</p>
      <div className="mb-5 flex flex-wrap gap-2">{items.map(item => <button type="button" key={item.id} draggable={!checked} onDragStart={e => { e.dataTransfer.setData("text/plain", item.id); setPicked(item.id); }} disabled={checked} onClick={() => setPicked(item.id)} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm ${picked === item.id ? "border-[#7566B8] bg-[#F0EDFA]" : "border-slate-200 bg-white"}`}><GripVertical className="h-4 w-4 text-slate-400"/>{item.label}{assignments[item.id] && <Check className="h-4 w-4 text-[#7566B8]"/>}</button>)}</div>
      <div className="grid gap-3 sm:grid-cols-2">{groups.map((group, i) => <button type="button" key={group.id} onClick={() => assign(group.id, picked)} onDragOver={e => e.preventDefault()} onDrop={e => drop(e, group.id)} className={`min-h-[130px] rounded-2xl border-2 border-dashed p-4 text-left ${i % 2 ? "border-[#84C8D8] bg-[#EAF8FA]" : "border-[#A99BDB] bg-[#F1EDFA]"}`}><h4 className="mb-3 text-sm font-bold">{group.label}</h4><div className="flex flex-wrap gap-2">{items.filter(item => assignments[item.id] === group.id).map(item => <span key={item.id} className={`rounded-lg bg-white px-3 py-2 text-xs ${checked ? item.groupId === group.id ? "text-emerald-700" : "text-red-600" : "text-slate-700"}`}>{item.label} {checked && (item.groupId === group.id ? "✓" : "✕")}</span>)}</div></button>)}</div>
      {!checked ? <button type="button" disabled={assignedCount !== items.length} onClick={verifySorting} className="mt-5 rounded-xl bg-[#7566B8] px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">Comprobar clasificación ({assignedCount}/{items.length})</button> : <div className="mt-5 rounded-xl bg-[#F2F4FB] p-4"><p className="font-semibold">{score} de {items.length} elementos correctos</p><div className="mt-3 space-y-2">{items.filter(i => assignments[i.id] !== i.groupId).map(i => <p key={i.id} className="text-sm text-slate-600">{i.label}: {i.feedback || `Categoría correcta: ${groups.find(g => g.id === i.groupId)?.label ?? ""}`}</p>)}</div>{score < items.length && <button type="button" className="mt-4 flex items-center gap-2 text-sm font-semibold text-[#7566B8]" onClick={() => { setChecked(false); setPicked(null); setAssignments({}); onChange(""); }}><RotateCcw className="h-4 w-4"/> Volver a intentarlo</button>}</div>}
    </> : <div className="rounded-2xl bg-[#F2F4FB] p-5"><p className="text-sm leading-7 text-slate-600">Esta actividad de reflexión abierta se reserva para la evaluación final. Puedes continuar con la lección.</p><button type="button" onClick={onReview} className="mt-4 rounded-xl bg-[#7566B8] px-5 py-3 text-sm font-semibold text-white">Continuar aprendiendo</button></div>}
    {hints > 0 && <div className="mt-4 rounded-xl bg-amber-50 p-4">{activity.hints.slice(0, hints).map((h, i) => <p key={i} className="text-sm leading-6 text-amber-900">{h}</p>)}</div>}
    {hints < activity.hints.length && !checked && !confirmed && <button type="button" onClick={() => setHints(p => p + 1)} className="mt-4 text-xs font-semibold text-[#7566B8]">Mostrar una pista</button>}
    {reviewed && <p className="mt-4 flex items-center gap-2 text-xs text-slate-500"><Check className="h-4 w-4"/> Práctica realizada en esta sesión; no constituye una evaluación final.</p>}
  </section>;
}
