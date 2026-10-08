export const INTERACTION_KINDS = ['flip-cards','flip-challenge','match-pairs','sort-it','put-in-order','quick-quiz','choose-your-path'] as const;
export type InteractionKind = typeof INTERACTION_KINDS[number];
export type InteractionData = {
 kind: InteractionKind; instruction: string;
 items?: {id:string;label:string;description?:string;groupId?:string;matchId?:string;feedback?:string}[];
 options?: {id:string;label:string;feedback?:string;consequence?:string;isPreferred?:boolean}[];
 groups?: {id:string;label:string}[]; debrief?:string|null; maxAttempts?:number;
};
const object=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const txt=(x:unknown):x is string=>typeof x==='string'&&x.trim().length>0;
const ids=(xs:{id:string}[])=>new Set(xs.map(x=>x.id)).size===xs.length;
export function validateInteraction(x:unknown):x is InteractionData {
 if(!object(x)||!INTERACTION_KINDS.includes(x.kind as InteractionKind)||!txt(x.instruction))return false;
 const items=x.items,options=x.options,groups=x.groups;
 if(x.debrief!==undefined&&x.debrief!==null&&typeof x.debrief!=='string')return false;
 if(x.maxAttempts!==undefined&&(!Number.isInteger(x.maxAttempts)||(x.maxAttempts as number)<1))return false;
 const validItems=Array.isArray(items)&&items.every(i=>object(i)&&txt(i.id)&&txt(i.label))&&ids(items);
 const validOptions=Array.isArray(options)&&options.every(o=>object(o)&&txt(o.id)&&txt(o.label))&&ids(options);
 if(x.kind==='flip-cards')return validItems&&items.length>=2&&items.length<=6&&items.every(i=>txt(i.description));
 if(x.kind==='flip-challenge'||x.kind==='quick-quiz'||x.kind==='choose-your-path')return validOptions&&options.length>=2&&options.length<=4&&options.filter(o=>o.isPreferred===true).length===1&&options.every(o=>txt(o.feedback)||txt(o.consequence));
 if(x.kind==='put-in-order')return validItems&&items.length>=3&&items.length<=7;
 if(x.kind==='match-pairs'){
  if(!validItems||items.length<4||items.length>12||items.length%2!==0)return false;
  const left=items.filter(i=>txt(i.matchId)),right=items.filter(i=>!txt(i.matchId));
  return left.length===right.length&&left.length>=2&&left.every(i=>right.some(r=>r.id===i.matchId))&&new Set(left.map(i=>i.matchId)).size===left.length;
 }
 if(x.kind==='sort-it')return validItems&&items.length>=3&&items.length<=8&&Array.isArray(groups)&&groups.length>=2&&groups.length<=4&&groups.every(g=>object(g)&&txt(g.id)&&txt(g.label))&&ids(groups)&&items.every(i=>groups.some(g=>g.id===i.groupId));
 return false;
}
