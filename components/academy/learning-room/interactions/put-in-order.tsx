'use client';
// components/academy/learning-room/interactions/put-in-order.tsx
import {useState,type DragEvent} from 'react';
import {ArrowDown,ArrowUp,GripVertical} from 'lucide-react';
import {card,type InteractionProps} from './types';
export function PutInOrder({data,onComplete}:InteractionProps){
 const items=data.items??[];const [order,setOrder]=useState<string[]>(()=>[...items].reverse().map(x=>x.id));const [checked,setChecked]=useState(false);
 function move(from:number,to:number){if(checked||to<0||to>=order.length)return;setOrder(p=>{const a=[...p];const [id]=a.splice(from,1);a.splice(to,0,id);return a;});}
 function drop(e:DragEvent,to:number){e.preventDefault();const id=e.dataTransfer.getData('text/plain');move(order.indexOf(id),to);}
 function verify(){setChecked(true);const hits=order.filter((id,i)=>id===items[i]?.id).length;onComplete({correct:hits===items.length,score:Math.round(hits/Math.max(1,items.length)*100)});}
 return <div><p className="mb-4 text-sm text-slate-600">{data.instruction}</p><div className="space-y-2">{order.map((id,i)=>{const item=items.find(x=>x.id===id);return <div key={id} draggable={!checked} onDragStart={e=>e.dataTransfer.setData('text/plain',id)} onDragOver={e=>e.preventDefault()} onDrop={e=>drop(e,i)} className={`${card} flex items-center gap-3`}><GripVertical className="h-4 w-4 text-slate-400"/><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-bold">{i+1}</span><span className="flex-1 text-sm">{item?.label}</span><button type="button" disabled={checked||i===0} aria-label="Subir" onClick={()=>move(i,i-1)}><ArrowUp className="h-4 w-4"/></button><button type="button" disabled={checked||i===order.length-1} aria-label="Bajar" onClick={()=>move(i,i+1)}><ArrowDown className="h-4 w-4"/></button></div>})}</div>{!checked?<button type="button" onClick={verify} className="mt-5 rounded-xl bg-[#7566B8] px-5 py-3 text-sm font-semibold text-white">Comprobar orden</button>:<div className="mt-4 rounded-xl bg-[#F2F0FA] p-4 text-sm">{order.every((id,i)=>id===items[i]?.id)?'Orden correcto.':'El orden no es correcto.'} {data.debrief}</div>}</div>;
}
