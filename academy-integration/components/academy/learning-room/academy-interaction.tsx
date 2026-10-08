'use client';
import {InteractionRenderer} from './interactions/interaction-renderer';
import type {InteractionData} from '@/lib/academy/interaction-schema';
export function AcademyInteraction({data,completed,onComplete}:{data:InteractionData;completed:boolean;onComplete:()=>void}){
 return <section className="rounded-[28px] bg-white p-5 shadow-sm sm:p-7"><div className="mb-5 text-xs font-bold uppercase tracking-wider text-[#7566B8]">Actividad interactiva</div><InteractionRenderer data={data} completed={completed} onComplete={()=>onComplete()}/>{completed&&<p className="mt-4 text-xs font-medium text-emerald-700">Actividad completada. Puedes continuar.</p>}</section>;
}
