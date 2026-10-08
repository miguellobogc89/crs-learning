'use client';
// components/academy/learning-room/interactions/choose-your-path.tsx
import {useState} from 'react';
import {ArrowRight} from 'lucide-react';
import {tones,type InteractionProps} from './types';
export function ChooseYourPath({data,onComplete}:InteractionProps){
 const [selected,setSelected]=useState<string|null>(null);const options=data.options??[];const option=options.find(x=>x.id===selected);
 function choose(id:string){if(selected)return;setSelected(id);const x=options.find(o=>o.id===id);onComplete({correct:!!x?.isPreferred,score:x?.isPreferred?100:0});}
 return <div><p className="mb-4 text-base font-semibold">{data.instruction}</p><div className="grid gap-3 sm:grid-cols-2">{options.map((o,i)=><button type="button" disabled={!!selected} key={o.id} onClick={()=>choose(o.id)} className={`flex min-h-32 flex-col justify-between rounded-[24px] p-5 text-left ${tones[i%tones.length]} ${selected===o.id?'ring-2 ring-violet-600':''}`}><strong>{o.label}</strong><ArrowRight className="mt-4 h-5 w-5"/></button>)}</div>{option&&<div className="mt-4 rounded-2xl bg-[#F1EEFA] p-5"><strong>Consecuencia de tu decisión</strong><p className="mt-2 text-sm leading-6">{option.consequence}</p><p className="mt-2 text-sm leading-6">{option.feedback}</p></div>}</div>;
}
