'use client';
// components/academy/learning-room/interactions/flip-cards.tsx
import {useState} from 'react';
import {RotateCcw, Sparkles} from 'lucide-react';
import {tones,type InteractionProps} from './types';
export function FlipCards({data,onComplete}:InteractionProps){
 const [opened,setOpened]=useState<string[]>([]); const items=data.items??[];
 function flip(id:string){const next=opened.includes(id)?opened.filter(x=>x!==id):[...opened,id];setOpened(next);if(items.length>0&&items.every(x=>next.includes(x.id)))onComplete({correct:true,score:100});}
 return <div><p className="mb-4 text-sm text-slate-600">{data.instruction}</p><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{items.map((x,i)=><button key={x.id} type="button" aria-expanded={opened.includes(x.id)} onClick={()=>flip(x.id)} className={`flex min-h-[230px] flex-col items-start rounded-[26px] p-5 text-left transition-transform hover:-translate-y-1 ${tones[i%tones.length]}`}><span className="mb-5 flex h-10 w-10 items-center justify-center rounded-full bg-white/70"><Sparkles className="h-5 w-5"/></span><strong className="text-base">{x.label}</strong><span className="mt-4 text-sm leading-6">{opened.includes(x.id)?x.description:'Pulsa para descubrir'}</span><span className="mt-auto flex items-center gap-1 pt-5 text-xs"><RotateCcw className="h-3 w-3"/>{opened.includes(x.id)?'Voltear':'Descubrir'}</span></button>)}</div><p className="mt-3 text-xs text-slate-500">{opened.length} de {items.length} descubiertas</p></div>;
}
