// components/academy/learning-room/interactions/types.ts
export type Option = { id:string; label:string; feedback?:string; consequence?:string; isPreferred?:boolean };
export type Item = { id:string; label:string; description?:string; groupId?:string; matchId?:string; feedback?:string };
export type Group = { id:string; label:string };
export type InteractionKind = 'flip-cards'|'flip-challenge'|'match-pairs'|'sort-it'|'put-in-order'|'quick-quiz'|'choose-your-path';
export type InteractionData = { kind:InteractionKind; instruction:string; items?:Item[]; options?:Option[]; groups?:Group[]; debrief?:string|null; maxAttempts?:number };
export type InteractionProps = { data:InteractionData; onComplete:(result:{correct:boolean;score:number})=>void; completed?:boolean };
export const tones=['bg-[#EEE8FC] text-[#51408B]','bg-[#DFF5F9] text-[#236B7B]','bg-[#FBE8E6] text-[#8B4E57]','bg-[#E7F3E9] text-[#416D53]'];
export const card='rounded-[24px] border border-[#E7E4F1] bg-white p-5 shadow-sm transition hover:shadow-md';
export function uniqueIds(items:{id:string}[]){return new Set(items.map(x=>x.id)).size===items.length;}
