'use client';
// components/academy/learning-room/interactions/quick-quiz.tsx
import {useState} from 'react';
import {tones,type InteractionProps} from './types';
export function QuickQuiz({data,onComplete}:InteractionProps){
 const [selected,setSelected]=useState<string|null>(null);const [checked,setChecked]=useState(false);const options=data.options??[];const option=options.find(x=>x.id===selected);
 function verify(){if(!option)return;setChecked(true);onComplete({correct:!!option.isPreferred,score:option.isPreferred?100:0});}
 return <div><p className="mb-4 text-base font-semibold">{data.instruction}</p><div className="grid gap-3 sm:grid-cols-2">{options.map((x,i)=><button key={x.id} type="button" disabled={checked} onClick={()=>setSelected(x.id)} className={`min-h-28 rounded-[24px] p-5 text-left text-sm ${tones[i%tones.length]} ${selected===x.id?'ring-2 ring-violet-600':''}`}><span className="mb-3 block text-xs font-bold">{String.fromCharCode(65+i)}</span>{x.label}</button>)}</div>{!checked?<button type="button" disabled={!selected} onClick={verify} className="mt-5 rounded-xl bg-[#7566B8] px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">Comprobar respuesta</button>:<div className="mt-4 rounded-xl bg-[#F2F0FA] p-4 text-sm"><strong>{option?.isPreferred?'Correcto':'Vamos a revisarlo'}</strong><p className="mt-2">{option?.feedback||option?.consequence}</p></div>}</div>;
}
