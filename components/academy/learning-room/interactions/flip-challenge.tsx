'use client';
// components/academy/learning-room/interactions/flip-challenge.tsx
import {useState} from 'react';
import {CheckCircle2,HelpCircle} from 'lucide-react';
import {tones,type InteractionProps} from './types';
export function FlipChallenge({data,onComplete}:InteractionProps){
 const [opened,setOpened]=useState<string[]>([]);const options=data.options??[];
 function flip(id:string){if(opened.includes(id))return;const next=[...opened,id];setOpened(next);if(next.length===options.length)onComplete({correct:true,score:100});}
 return <div><p className="mb-4 text-sm text-slate-600">{data.instruction}</p><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{options.map((o,i)=>{const open=opened.includes(o.id);return <button type="button" key={o.id} onClick={()=>flip(o.id)} aria-expanded={open} className={`flex min-h-[235px] flex-col items-start rounded-[26px] p-5 text-left transition hover:-translate-y-1 ${tones[i%tones.length]}`}><span className="mb-5">{open&&o.isPreferred?<CheckCircle2 className="h-7 w-7"/>:<HelpCircle className="h-7 w-7"/>}</span><strong className="text-base">{o.label}</strong><p className="mt-4 text-sm leading-6">{open?(o.feedback||o.consequence||'Sin explicación disponible.'):'Voltea para comprobar'}</p><span className="mt-auto pt-4 text-xs font-bold">{open?(o.isPreferred?'Respuesta adecuada':'Revisa esta alternativa'):'Descubrir'}</span></button>})}</div><p className="mt-3 text-xs text-slate-500">Descubre todas las alternativas para continuar: {opened.length}/{options.length}</p></div>;
}
