"use client";

import { useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ImportSummary({text}:{text:string}) {
  const [feedback,setFeedback]=useState<{text:string;ok:boolean;source:string}|null>(null);
  const textarea=useRef<HTMLTextAreaElement>(null);
  async function copyAll(){
    try{
      await navigator.clipboard.writeText(text);
      setFeedback({text:"Resumen completo copiado",ok:true,source:text});
    }catch{
      textarea.current?.focus();
      textarea.current?.select();
      setFeedback({text:"No se pudo acceder al portapapeles. El resumen está seleccionado: pulsa Ctrl+C o ⌘C.",ok:false,source:text});
    }
  }
  return <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
      <div><h3 className="text-sm font-semibold text-slate-900">Resumen completo</h3>
        <p className="text-xs text-slate-500">Todas las fases, resultados e incidencias en un único texto.</p></div>
      <Button type="button" variant="outline" onClick={()=>void copyAll()}>
        {feedback?.ok&&feedback.source===text ? <Check className="mr-2 size-4"/> : <Copy className="mr-2 size-4"/>}Copiar todo
      </Button>
    </div>
    <textarea ref={textarea} readOnly value={text} aria-label="Resumen completo de la importación" spellCheck={false}
      className="min-h-0 w-full flex-1 resize-none overflow-auto bg-white p-4 font-mono text-[13px] leading-6 text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 sm:p-6"/>
    {feedback?.source===text ? <p role="status" className="shrink-0 border-t px-4 py-2 text-xs text-slate-600">{feedback.text}</p> : null}
  </section>;
}
