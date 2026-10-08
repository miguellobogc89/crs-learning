"use client";
// components/academy/learning-room/didactic-visual.tsx
import { useState } from "react";
import { ArrowDown, ArrowRight, Check, Eye, Lightbulb, MoveUpRight, RotateCcw, Sparkles } from "lucide-react";
import type { DidacticScreen } from "@/lib/academy/didactic-package";
const tones = [
  { top: "bg-[#8D78C4]", bottom: "bg-[#66569B]" },
  { top: "bg-[#7778BD]", bottom: "bg-[#565A9B]" },
  { top: "bg-[#77CDE3]", bottom: "bg-[#328EA9]" },
  { top: "bg-[#E6A6A0]", bottom: "bg-[#B97881]" },
  { top: "bg-[#A1B8DF]", bottom: "bg-[#6B83B4]" },
  { top: "bg-[#9AC8B9]", bottom: "bg-[#568D82]" },
];
export function DidacticVisual({ screen }: { screen: DidacticScreen }) {
  const { layout, items } = screen.visual;
  const [opened, setOpened] = useState<number[]>([]);
  const [focused, setFocused] = useState(0);
  if (layout === "explore" || layout === "cards") {
    return <div>
      <div className="mb-4 flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-xs font-semibold text-slate-500"><Eye className="h-4 w-4"/> Toca cada tarjeta para descubrir su contenido</span><span className="text-xs text-slate-400">{opened.length} / {items.length} exploradas</span></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {items.map((item, i) => {
          const tone = tones[i % tones.length]; const active = opened.includes(i);
          return <button key={i} type="button" aria-expanded={active} onClick={() => setOpened(p => p.includes(i) ? p.filter(x => x !== i) : [...p, i])} className="group flex min-h-[240px] flex-col overflow-hidden rounded-[24px] text-left shadow-sm transition-transform hover:-translate-y-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500">
            <div className={`flex min-h-[110px] items-start justify-between p-4 text-white ${tone.top}`}>
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20"><Sparkles className="h-6 w-6"/></span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-indigo-600 text-sm font-bold">{active ? <Check className="h-4 w-4"/> : i + 1}</span>
            </div>
            <div className={`flex flex-1 flex-col p-4 text-white ${tone.bottom}`}><h3 className="text-base font-bold leading-snug">{item.title}</h3><p className="mt-3 text-xs leading-6 text-white/90">{active ? item.description : "Descubre el concepto y su aplicación práctica."}</p><span className="mt-auto flex items-center gap-1 pt-4 text-[11px] font-semibold text-white/80">{active ? <RotateCcw className="h-3 w-3"/> : <MoveUpRight className="h-3 w-3"/>}{active ? "Ocultar" : "Descubrir"}</span></div>
          </button>;
        })}
      </div>
    </div>;
  }
  if (layout === "steps" || layout === "timeline" || layout === "diagram") {
    return <div className="mx-auto max-w-3xl space-y-2">{items.map((item, i) => <div key={i}><div className="flex items-start gap-4 rounded-2xl bg-[#F2F3FC] p-5"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#6C66B6] text-white">{i + 1}</span><div><h3 className="font-bold">{item.title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p></div></div>{i < items.length - 1 && <ArrowDown className="mx-auto my-2 h-5 w-5 text-[#9E9BCD]"/>}</div>)}</div>;
  }
  if (layout === "scenario") {
    return <div className="mx-auto max-w-4xl rounded-3xl bg-[#EEEAF9] p-6 sm:p-8"><div className="mb-5 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#6C60A8]"><Lightbulb className="h-4 w-4"/> Situación profesional</div><h3 className="text-xl font-bold">{items[0]?.title}</h3><p className="mt-3 max-w-3xl text-sm leading-7 text-slate-700">{items[0]?.description}</p>{items.length > 1 && <div className="mt-5 grid gap-3 sm:grid-cols-2">{items.slice(1).map((item, i) => <div key={i} className="rounded-2xl bg-white p-4"><h4 className="font-semibold">{item.title}</h4><p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p></div>)}</div>}</div>;
  }
  if (layout === "statement") return <div className="mx-auto max-w-3xl rounded-3xl bg-[#EAF6F9] p-8 text-center"><Lightbulb className="mx-auto mb-5 h-9 w-9 text-[#3A9AB0]"/>{items.map((item, i) => <div key={i} className="mb-4 last:mb-0"><h3 className="text-xl font-bold">{item.title}</h3><p className="mt-3 text-sm leading-7 text-slate-600">{item.description}</p></div>)}</div>;
  return <div className="grid gap-4 md:grid-cols-2">{items.map((item, i) => <button type="button" key={i} onClick={() => setFocused(i)} className={`rounded-2xl border p-5 text-left transition ${focused === i ? "border-[#8A7DC4] bg-[#F1EDFB]" : "border-slate-100 bg-[#F6F7FA]"}`}><span className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[#7566B4]"><ArrowRight className="h-5 w-5"/></span><h3 className="font-bold">{item.title}</h3><p className="mt-2 text-sm leading-7 text-slate-600">{item.description}</p></button>)}</div>;
}
